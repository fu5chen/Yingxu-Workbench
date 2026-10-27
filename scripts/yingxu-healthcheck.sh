#!/bin/bash
set -eu
# Only the application's HTTP health is authoritative, not the wrapper PID.
state_dir=${YINGXU_HEALTH_STATE:-/run/yingxu-health}
mkdir -p "$state_dir"
exec 9>"$state_dir/lock"
flock -n 9 || exit 0
if curl --fail --silent --max-time 5 http://127.0.0.1:5181/ -o /dev/null; then
 echo 0 > "$state_dir/failures"
 exit 0
fi
failures=$(cat "$state_dir/failures" 2>/dev/null || echo 0)
failures=$((failures+1))
echo "$failures" > "$state_dir/failures"
echo "Yingxu HTTP health failed ($failures consecutive probes)"
[ "$failures" -ge 3 ] || exit 0
now=$(date +%s)
last=$(cat "$state_dir/restarted" 2>/dev/null || echo 0)
[ $((now-last)) -ge 300 ] || exit 0
echo "$now" > "$state_dir/restarted"
echo 'Recovering unavailable Yingxu backend; generation POSTs will not be replayed.'
systemctl show yingxu-worker -p MainPID -p MemoryCurrent -p MemoryPeak -p NRestarts
df -h "${YINGXU_APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
systemctl restart yingxu-worker
# Keep failure evidence; next healthy probe resets the counter.
