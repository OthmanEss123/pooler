import grpc

from apps.agents.shared.config import GRPC_TARGET
from apps.agents.shared.grpc_client import campaigns_pb2_grpc
from apps.agents.shared.grpc_client import contacts_pb2_grpc
from apps.agents.shared.grpc_client import intelligence_pb2_grpc


class BaseAgent:
    def __init__(self):
        self.channel = grpc.insecure_channel(GRPC_TARGET)
        self.contacts_stub = contacts_pb2_grpc.ContactsServiceStub(self.channel)
        self.intelligence_stub = intelligence_pb2_grpc.IntelligenceServiceStub(
            self.channel
        )
        self.campaigns_stub = campaigns_pb2_grpc.CampaignsServiceStub(self.channel)

    def close(self):
        self.channel.close()
