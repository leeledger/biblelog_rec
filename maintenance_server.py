from flask import Flask, render_template_string
import os
import sys
import argparse

app = Flask(__name__)

# 유지보수 페이지 HTML 템플릿
MAINTENANCE_HTML = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>서비스 점검 안내</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: #333;
        }
        .maintenance-container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 40px;
            max-width: 600px;
            width: 100%;
            text-align: center;
        }
        h1 {
            color: #e74c3c;
            margin-top: 0;
        }
        p {
            line-height: 1.6;
            margin: 20px 0;
        }
        .icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .estimated-time {
            font-weight: bold;
            background-color: #f8f8f8;
            padding: 10px;
            border-radius: 4px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="maintenance-container">
        <div class="icon">🛠️</div>
        <h1>서비스 점검 안내</h1>
        <p>안녕하세요, 성경 읽기 도우미를 이용해 주셔서 감사합니다.</p>
        <p>현재 서비스 안정성 향상을 위한 시스템 점검을 진행 중입니다.</p>
        <div class="estimated-time">
            예상 점검 시간: 약 30분
        </div>
        <p>작업이 완료되면 자동으로 서비스가 정상화됩니다.</p>
        <p>불편을 드려 죄송합니다. 더 나은 서비스로 찾아뵙겠습니다.</p>
    </div>
</body>
</html>
"""

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    # 모든 경로에서 유지보수 페이지 반환
    return render_template_string(MAINTENANCE_HTML), 503

def main():
    parser = argparse.ArgumentParser(description='간단한 유지보수 서버')
    parser.add_argument('--port', type=int, default=8080, help='서버 실행 포트 (기본값: 8080)')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='서버 호스트 (기본값: 0.0.0.0)')
    
    args = parser.parse_args()
    
    print(f"유지보수 서버를 {args.host}:{args.port}에서 시작합니다...")
    print("서버를 중지하려면 Ctrl+C를 누르세요.")
    
    app.run(host=args.host, port=args.port)

if __name__ == '__main__':
    main()
