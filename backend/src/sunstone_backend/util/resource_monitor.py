import psutil
import time
from pathlib import Path
from threading import Thread
import json

def monitor_resources(run_dir: Path, interval: float = 1.0):
    """Background thread to monitor and log resource usage."""
    resource_path = run_dir / "runtime" / "resource.json"
    process = psutil.Process()
    samples = []
    # Prime the CPU percent measurement so the first sample is meaningful
    psutil.cpu_percent(interval=None)
    while True:
        usage = {
            "timestamp": time.time(),
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory_rss": process.memory_info().rss,
            "memory_vms": process.memory_info().vms,
            "memory_percent": process.memory_percent(),
        }
        samples.append(usage)
        # Write only the last 100 samples to avoid file bloat
        with open(resource_path, "w") as f:
            json.dump(samples[-100:], f)
        time.sleep(interval)
