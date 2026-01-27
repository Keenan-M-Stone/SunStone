import psutil
import time
from pathlib import Path
from threading import Thread
import json

def monitor_resources(run_dir: Path, interval: float = 1.0):
    """Background thread to monitor and log resource usage."""
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("resource_monitor")
    resource_path = run_dir / "runtime" / "resource.json"
    process = psutil.Process()
    samples = []
    logger.info(f"[ResourceMonitor] Starting resource monitor thread for {run_dir}")
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
        try:
            with open(resource_path, "w") as f:
                json.dump(samples[-100:], f)
            logger.info(f"[ResourceMonitor] Wrote resource sample: {usage}")
        except Exception as e:
            logger.error(f"[ResourceMonitor] Failed to write resource.json: {e}")
        time.sleep(interval)
