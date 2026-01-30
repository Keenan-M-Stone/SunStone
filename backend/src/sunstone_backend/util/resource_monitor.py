import psutil
import time
from pathlib import Path
from threading import Thread
import json

# Optional GPU sampling via GPUtil
try:
    import GPUtil
    _HAS_GPU = True
except Exception:
    _HAS_GPU = False


def _aggregate_process_tree(proc: psutil.Process):
    """Aggregate cpu and memory across a process and its children."""
    cpu = proc.cpu_percent(interval=None)
    mem = proc.memory_info().rss
    for child in proc.children(recursive=True):
        try:
            cpu += child.cpu_percent(interval=None)
            mem += child.memory_info().rss
        except Exception:
            continue
    return cpu, mem


def monitor_resources(run_dir: Path, interval: float = 1.0):
    """Background thread to monitor and log resource usage.

    Writes a rolling window of the most recent samples to runtime/resource.json (max 200).
    """
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("resource_monitor")
    resource_path = run_dir / "runtime" / "resource.json"
    process = psutil.Process()
    samples = []
    logger.info(f"[ResourceMonitor] Starting resource monitor thread for {run_dir}")
    # Prime CPU counters
    psutil.cpu_percent(interval=None)
    process.cpu_percent(interval=None)

    while True:
        try:
            cpu_system = psutil.cpu_percent(interval=None)
            cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
            proc_cpu, proc_mem = _aggregate_process_tree(process)
            mem_total = psutil.virtual_memory().total
            mem_available = psutil.virtual_memory().available
            io_counters = psutil.disk_io_counters()
            net_counters = psutil.net_io_counters()
            threads = process.num_threads()
            open_files = len(process.open_files())

            gpu_info = None
            if _HAS_GPU:
                try:
                    gpus = GPUtil.getGPUs()
                    gpu_info = [
                        {
                            "id": g.id,
                            "name": g.name,
                            "load": g.load,
                            "memory_total": getattr(g, "memoryTotal", None),
                            "memory_used": getattr(g, "memoryUsed", None),
                            "memory_util": getattr(g, "memoryUtil", None),
                        }
                        for g in gpus
                    ]
                except Exception:
                    gpu_info = None

            usage = {
                "timestamp": time.time(),
                "cpu_system_percent": cpu_system,
                "cpu_per_core": cpu_per_core,
                "proc_cpu_percent": proc_cpu,
                "proc_memory_rss": proc_mem,
                "memory_total": mem_total,
                "memory_available": mem_available,
                "disk_read_bytes": getattr(io_counters, "read_bytes", None),
                "disk_write_bytes": getattr(io_counters, "write_bytes", None),
                "net_bytes_sent": getattr(net_counters, "bytes_sent", None),
                "net_bytes_recv": getattr(net_counters, "bytes_recv", None),
                "threads": threads,
                "open_files": open_files,
                "gpus": gpu_info,
            }
            samples.append(usage)
            # Keep last 200 samples
            data = samples[-200:]
            try:
                with open(resource_path, "w") as f:
                    json.dump(data, f)
                logger.debug(f"[ResourceMonitor] Wrote {len(data)} samples")
            except Exception as e:
                logger.error(f"[ResourceMonitor] Failed to write resource.json: {e}")
        except Exception as e:
            logger.error(f"[ResourceMonitor] Sampling failed: {e}")
        time.sleep(interval)
