from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

MAX_TREE_NODES = 120  # Safety cap to avoid long runtimes


def run_greedy(investable, time_horizon, fds):
    eligible = sorted(
        [fd for fd in fds if fd['duration'] <= time_horizon],
        key=lambda x: x['rate'],
        reverse=True
    )
    if not eligible:
        return None, None

    best = eligible[0]
    interest = investable * best['rate'] * best['duration']
    label = f"{best['duration']}Y {round(best['rate'] * 100, 1)}%"

    steps = [{"fd": label, "allocated": round(investable, 2), "remaining": 0}]
    return steps, round(investable + interest, 2)


def run_backtracking(investable, time_horizon, fds):
    """
    Returns (nodes, edges, best_path_ids, best_value)

    nodes  – list of {id, parent_id, label, fd, value, depth, complete}
    edges  – list of {from_id, to_id}
    best_path_ids – ordered list of node IDs on the optimal path
    best_value – float, the highest return found
    """
    eligible_fds = [fd for fd in fds if fd['duration'] <= time_horizon]

    nodes = []
    edges = []
    node_counter = [0]

    # best tracker
    best = {"value": round(investable, 2), "path_ids": []}

    def make_node(parent_id, fd_label, value, depth, complete):
        nid = node_counter[0]
        node_counter[0] += 1
        nodes.append({
            "id": nid,
            "parent_id": parent_id,
            "fd": fd_label,
            "value": round(value, 2),
            "depth": depth,
            "complete": complete
        })
        if parent_id is not None:
            edges.append({"from_id": parent_id, "to_id": nid})
        return nid

    # Create root node
    root_id = make_node(None, "Start", investable, 0, time_horizon == 0)

    def backtrack(parent_id, remaining_time, current_amount, depth, path_ids):
        nonlocal best
        if len(nodes) >= MAX_TREE_NODES:
            return

        # Update best if this leaf is better
        if current_amount > best["value"]:
            best["value"] = round(current_amount, 2)
            best["path_ids"] = path_ids[:]

        for fd in eligible_fds:
            if fd['duration'] > remaining_time:
                continue
            if len(nodes) >= MAX_TREE_NODES:
                return

            new_time = remaining_time - fd['duration']
            interest = current_amount * fd['rate'] * fd['duration']
            new_amount = current_amount + interest
            label = f"{fd['duration']}Y {round(fd['rate'] * 100, 1)}%"
            complete = new_time == 0

            nid = make_node(parent_id, label, new_amount, depth + 1, complete)
            path_ids.append(nid)
            backtrack(nid, new_time, new_amount, depth + 1, path_ids)
            path_ids.pop()

    backtrack(root_id, time_horizon, investable, 0, [root_id])

    # If no FD fits, best path is just root
    if not best["path_ids"]:
        best["path_ids"] = [root_id]

    return nodes, edges, best["path_ids"], best["value"]


@app.route('/optimize', methods=['POST'])
def optimize():
    data = request.get_json(force=True)
    total_amount = data.get('total_amount')
    time_horizon = data.get('time_horizon')
    emergency_fund = data.get('emergency_fund', 0)
    fds = data.get('fds', [])
    mode = request.args.get('mode', 'greedy')

    if total_amount is None or time_horizon is None:
        return jsonify({'error': 'Missing required fields.'}), 400
    if not fds:
        return jsonify({'error': 'No FD options provided.'}), 400

    investable = total_amount - emergency_fund

    if mode == 'backtracking':
        nodes, edges, best_path_ids, best_value = run_backtracking(
            investable, time_horizon, fds
        )
        if not nodes:
            return jsonify({'error': 'No FD fits within the given time horizon.'}), 400
        return jsonify({
            "strategy": "backtracking",
            "nodes": nodes,
            "edges": edges,
            "best_path_ids": best_path_ids,
            "best_value": best_value
        }), 200

    else:  # default: greedy
        steps, total_return = run_greedy(investable, time_horizon, fds)
        if steps is None:
            return jsonify({'error': 'No FD fits within the given time horizon.'}), 400
        return jsonify({
            "strategy": "greedy",
            "steps": steps,
            "total_return": total_return
        }), 200


if __name__ == '__main__':
    app.run(port=5000, debug=True)
