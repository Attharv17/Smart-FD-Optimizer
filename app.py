from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

MAX_TREE_NODES = 120


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


def run_greedy(investable, horizon, fds):
    eligible = sorted([fd for fd in fds if fd['duration'] <= horizon],
                      key=lambda x: x['rate'], reverse=True)
    if not eligible:
        return None, None
    best = eligible[0]
    label = f"{best['duration']}Y {round(best['rate'] * 100, 1)}%"
    total = round(investable + investable * best['rate'] * best['duration'], 2)
    return [{"fd": label, "allocated": round(investable, 2), "remaining": 0}], total


def run_backtracking(investable, horizon, fds):
    eligible = [fd for fd in fds if fd['duration'] <= horizon]
    nodes, edges, counter = [], [], [0]
    best = {"value": round(investable, 2), "path_ids": []}

    def make_node(parent_id, fd_label, value, depth):
        nid = counter[0]; counter[0] += 1
        nodes.append({"id": nid, "parent_id": parent_id, "fd": fd_label,
                      "value": round(value, 2), "depth": depth})
        if parent_id is not None:
            edges.append({"from_id": parent_id, "to_id": nid})
        return nid

    root_id = make_node(None, "Start", investable, 0)

    def backtrack(parent_id, rem, amount, depth, path):
        if len(nodes) >= MAX_TREE_NODES:
            return
        if amount > best["value"]:
            best["value"] = round(amount, 2)
            best["path_ids"] = path[:]
        for fd in eligible:
            if fd['duration'] > rem or len(nodes) >= MAX_TREE_NODES:
                continue
            new_amount = amount + amount * fd['rate'] * fd['duration']
            label = f"{fd['duration']}Y {round(fd['rate'] * 100, 1)}%"
            nid = make_node(parent_id, label, new_amount, depth + 1)
            path.append(nid)
            backtrack(nid, rem - fd['duration'], new_amount, depth + 1, path)
            path.pop()

    backtrack(root_id, horizon, investable, 0, [root_id])
    if not best["path_ids"]:
        best["path_ids"] = [root_id]
    return nodes, edges, best["path_ids"], best["value"]


@app.route('/optimize', methods=['POST'])
def optimize():
    data = request.get_json(force=True)
    total = data.get('total_amount')
    horizon = data.get('time_horizon')
    emergency = data.get('emergency_fund', 0)
    fds = data.get('fds', [])
    mode = request.args.get('mode', 'greedy')

    if total is None or horizon is None:
        return jsonify({'error': 'Missing required fields.'}), 400
    if not fds:
        return jsonify({'error': 'No FD options provided.'}), 400

    investable = total - emergency

    if mode == 'backtracking':
        nodes, edges, best_ids, best_val = run_backtracking(investable, horizon, fds)
        if not nodes:
            return jsonify({'error': 'No FD fits within the given time horizon.'}), 400
        return jsonify({"strategy": "backtracking", "nodes": nodes, "edges": edges,
                        "best_path_ids": best_ids, "best_value": best_val}), 200

    steps, total_return = run_greedy(investable, horizon, fds)
    if steps is None:
        return jsonify({'error': 'No FD fits within the given time horizon.'}), 400
    return jsonify({"strategy": "greedy", "steps": steps, "total_return": total_return}), 200


if __name__ == '__main__':
    app.run(port=5000, debug=True)
