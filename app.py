from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MAX_TREE_NODES = 100  # Safety cap to avoid long runtimes


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
    tree = []
    best = {"path": [], "value": round(investable, 2)}

    eligible_fds = [fd for fd in fds if fd['duration'] <= time_horizon]

    def backtrack(remaining_time, current_amount, path):
        if len(tree) >= MAX_TREE_NODES:
            return

        label_path = [f"{fd['duration']}Y {round(fd['rate'] * 100, 1)}%" for fd in path]

        # Record this node in the exploration tree
        tree.append({
            "path": label_path,
            "value": round(current_amount, 2),
            "complete": remaining_time == 0
        })

        # Update best solution if this is the highest return found so far
        if current_amount > best["value"]:
            best["path"] = label_path[:]
            best["value"] = round(current_amount, 2)

        # Try each eligible FD for the remaining time
        for fd in eligible_fds:
            if fd['duration'] > remaining_time:
                continue
            if len(tree) >= MAX_TREE_NODES:
                return

            interest = current_amount * fd['rate'] * fd['duration']
            path.append(fd)
            backtrack(remaining_time - fd['duration'], current_amount + interest, path)
            path.pop()

    backtrack(time_horizon, investable, [])
    return tree, best


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
        tree, best = run_backtracking(investable, time_horizon, fds)
        if not tree:
            return jsonify({'error': 'No FD fits within the given time horizon.'}), 400
        return jsonify({
            "strategy": "backtracking",
            "best": best,
            "tree": tree
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
