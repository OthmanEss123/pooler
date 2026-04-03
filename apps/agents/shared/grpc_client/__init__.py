from pathlib import Path
import sys

grpc_client_dir = Path(__file__).resolve().parent
grpc_client_dir_str = str(grpc_client_dir)

if grpc_client_dir_str not in sys.path:
    sys.path.append(grpc_client_dir_str)
