import os
from collections import deque
from datetime import datetime, timedelta

import psutil

# Ring buffer to store the last 1000 API requests
# Format: {timestamp, method, path, status_code, latency_ms, client_ip}
MAX_LOGS = 1000
traffic_registry = deque(maxlen=MAX_LOGS)

# Lịch sử lưu trữ snapshot tài nguyên hệ thống 60 phút gần nhất
MAX_HISTORY = 60
system_history = deque(maxlen=MAX_HISTORY)

# Biến đếm request tổng cộng để tính toán RPM động giữa các snapshot
request_counter = 0
last_snapshot_requests = 0

def record_request(method: str, path: str, status_code: int, latency_ms: float, client_ip: str):
    """Ghi nhận một request vào ring buffer."""
    global request_counter
    request_counter += 1
    traffic_registry.append({
        "timestamp": datetime.utcnow(),
        "method": method,
        "path": path,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "client_ip": client_ip
    })

def record_system_snapshot(db_url: str):
    """Ghi nhận snapshot tài nguyên hệ thống hiện tại phục vụ vẽ biểu đồ timeline."""
    global request_counter, last_snapshot_requests
    try:
        metrics = get_system_metrics(db_url)
        cpu_p = metrics["cpu"]["percent"]
        ram_p = metrics["ram"]["percent"]

        # RPM trong chu kỳ 60 giây vừa rồi
        current_reqs = request_counter
        rpm = current_reqs - last_snapshot_requests
        last_snapshot_requests = current_reqs

        system_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "cpu_percent": cpu_p,
            "ram_percent": ram_p,
            "rpm": rpm
        })
    except Exception as e:
        print(f"[TELEMETRY ERROR] Failed to record system snapshot: {e}")

def get_system_metrics(db_url: str) -> dict:
    """Thu thập thông số phần cứng hiện tại và kích thước database."""
    # CPU usage
    cpu_percent = psutil.cpu_percent(interval=None)

    # RAM usage
    ram = psutil.virtual_memory()
    ram_total_gb = round(ram.total / (1024 ** 3), 2)
    ram_used_gb = round(ram.used / (1024 ** 3), 2)
    ram_percent = ram.percent

    # Disk usage (root/current partition)
    disk = psutil.disk_usage('.')
    disk_total_gb = round(disk.total / (1024 ** 3), 2)
    disk_used_gb = round(disk.used / (1024 ** 3), 2)
    disk_percent = disk.percent

    # DB size
    db_size_mb = 0.0
    if db_url.startswith("sqlite:///"):
        db_path = db_url.replace("sqlite:///", "")
        if os.path.exists(db_path):
            db_size_mb = round(os.path.getsize(db_path) / (1024 * 1024), 2)

    return {
        "cpu": {
            "percent": cpu_percent,
            "status": "danger" if cpu_percent > 90 else "warning" if cpu_percent > 70 else "normal"
        },
        "ram": {
            "total_gb": ram_total_gb,
            "used_gb": ram_used_gb,
            "percent": ram_percent,
            "status": "danger" if ram_percent > 90 else "warning" if ram_percent > 75 else "normal"
        },
        "disk": {
            "total_gb": disk_total_gb,
            "used_gb": disk_used_gb,
            "percent": disk_percent,
            "status": "danger" if disk_percent > 90 else "normal"
        },
        "db": {
            "size_mb": db_size_mb,
            "type": "SQLite" if db_url.startswith("sqlite") else "PostgreSQL"
        }
    }

def get_traffic_summary(time_window_minutes: int = 60) -> dict:
    """Tổng hợp traffic logs trong khoảng thời gian nhất định (mặc định là 60 phút)."""
    cutoff = datetime.utcnow() - timedelta(minutes=time_window_minutes)

    recent_requests = [req for req in traffic_registry if req["timestamp"] >= cutoff]

    total_requests = len(recent_requests)
    if total_requests == 0:
        return {
            "total_requests": 0,
            "average_latency_ms": 0.0,
            "status_codes": {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0},
            "requests_per_minute": 0.0,
            "slow_endpoints": []
        }

    total_latency = sum(req["latency_ms"] for req in recent_requests)
    avg_latency = round(total_latency / total_requests, 2)

    # Calculate Latency Percentiles (p50, p90, p99)
    latencies = sorted([req["latency_ms"] for req in recent_requests])
    n = len(latencies)
    if n > 0:
        p50 = round(latencies[int(n * 0.50)], 2)
        p90 = round(latencies[int(n * 0.90)], 2)
        p99 = round(latencies[int(n * 0.99)] if int(n * 0.99) < n else latencies[-1], 2)
    else:
        p50 = p90 = p99 = 0.0

    # Status codes counter
    status_codes = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
    for req in recent_requests:
        code = req["status_code"]
        if 200 <= code < 300:
            status_codes["2xx"] += 1
        elif 300 <= code < 400:
            status_codes["3xx"] += 1
        elif 400 <= code < 500:
            status_codes["4xx"] += 1
        elif 500 <= code < 600:
            status_codes["5xx"] += 1

    # Calculate requests per minute (rpm)
    rpm = round(total_requests / time_window_minutes, 2)

    # Identify top 5 slow endpoints
    path_latencies = {}
    for req in recent_requests:
        path = f"{req['method']} {req['path']}"
        if path not in path_latencies:
            path_latencies[path] = []
        path_latencies[path].append(req["latency_ms"])

    slow_endpoints = []
    for path, latencies in path_latencies.items():
        avg_path_lat = sum(latencies) / len(latencies)
        slow_endpoints.append({
            "endpoint": path,
            "calls": len(latencies),
            "avg_latency_ms": round(avg_path_lat, 2),
            "max_latency_ms": round(max(latencies), 2)
        })

    # Sort by average latency descending
    slow_endpoints.sort(key=lambda x: x["avg_latency_ms"], reverse=True)

    return {
        "total_requests": total_requests,
        "average_latency_ms": avg_latency,
        "p50_latency_ms": p50,
        "p90_latency_ms": p90,
        "p99_latency_ms": p99,
        "status_codes": status_codes,
        "requests_per_minute": rpm,
        "slow_endpoints": slow_endpoints[:5]
    }
