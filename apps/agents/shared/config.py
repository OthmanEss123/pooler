import os

from dotenv import load_dotenv

load_dotenv()

GRPC_HOST = os.getenv("GRPC_HOST", "localhost")
GRPC_PORT = os.getenv("GRPC_PORT", "50051")
GRPC_TARGET = f"{GRPC_HOST}:{GRPC_PORT}"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
