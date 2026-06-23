import os
import re
import subprocess
import sys
import time

# Reconfigure standard output streams to UTF-8 to prevent charmap encoding errors on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

def run_tunnel(port):
    """Starts cloudflared tunnel for the given port and returns the process and its URL."""
    print(f"Starting Cloudflare Tunnel for port {port}...")
    cmd = ["cloudflared", "tunnel", "--url", f"http://localhost:{port}"]

    # Run in subprocess and capture stderr where cloudflared logs
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    url = None
    # We read line by line until we find the trycloudflare URL
    # We put a timeout of 15 seconds
    start_time = time.time()
    while True:
        if time.time() - start_time > 15:
            break

        line = process.stderr.readline()
        if not line:
            break

        # print line for debugging
        print(f"[cloudflared-{port}] {line.strip()}")

        match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
        if match:
            url = match.group(0)
            break

    if not url:
        process.terminate()
        raise Exception(f"Failed to retrieve Cloudflare Tunnel URL for port {port}.")

    return process, url

def main():
    print("==================================================")
    print("      Lauchng Cloudflare Sharing Tunnels...       ")
    print("==================================================")

    backend_proc = None
    frontend_proc = None
    web_server_proc = None

    try:
        # 1. Start Backend Tunnel on Port 8000
        backend_proc, backend_url = run_tunnel(8000)
        print(f"\n[SUCCESS] Backend Tunnel Created: {backend_url}\n")

        # 2. Build Next.js Frontend with the public Backend URL
        print("Building Next.js frontend with the public backend URL...")
        print("This might take a minute...")

        # Set environment variable for build time
        env = os.environ.copy()
        env['NEXT_PUBLIC_API_BASE_URL'] = backend_url

        # Run npm run build
        build_res = subprocess.run(
            "npm run build",
            shell=True,
            cwd="frontend",
            env=env
        )

        if build_res.returncode != 0:
            raise Exception("Next.js frontend build failed. Make sure you don't have compilation errors.")

        print("\n[SUCCESS] Frontend build completed successfully!\n")

        # 3. Start Frontend Next.js Server (npm run start)
        print("Starting Next.js production server...")
        web_server_proc = subprocess.Popen(
            "npm run start",
            shell=True,
            cwd="frontend",
            env=env
        )

        # Wait 3 seconds for server to start
        time.sleep(3)

        # 4. Start Frontend Tunnel on Port 3000
        frontend_proc, frontend_url = run_tunnel(3000)

        print("\n" + "="*60)
        print("TRANG WEB CỦA BẠN ĐÃ ĐƯỢC CHIA SẺ THÀNH CÔNG!")
        print("="*60)
        print("Link gửi cho bạn bè truy cập (24/7):")
        print(f"   {frontend_url}")
        print("-"*60)
        print(f"Backend API URL: {backend_url}")
        print("="*60)
        print("Nhấn Ctrl + C để dừng chia sẻ và tắt máy chủ.")
        print("="*60 + "\n")

        # Monitor the processes
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nShutting down sharing tunnels and server...")
    except Exception as e:
        print(f"\n[ERROR] {e}")
    finally:
        # Clean up all processes
        if web_server_proc:
            print("Stopping Next.js web server...")
            web_server_proc.terminate()
        if backend_proc:
            print("Stopping backend tunnel...")
            backend_proc.terminate()
        if frontend_proc:
            print("Stopping frontend tunnel...")
            frontend_proc.terminate()
        print("Cleaned up successfully.")

if __name__ == "__main__":
    main()
