import { join } from 'path';
import { GrpcOptions, Transport } from '@nestjs/microservices';

export const grpcServerOptions: GrpcOptions = {
  transport: Transport.GRPC,
  options: {
    url: `${process.env.GRPC_HOST ?? '127.0.0.1'}:${process.env.GRPC_PORT ?? '50051'}`,
    package: ['contacts', 'intelligence', 'campaigns'],
    protoPath: [
      join(process.cwd(), 'proto/contacts.proto'),
      join(process.cwd(), 'proto/intelligence.proto'),
      join(process.cwd(), 'proto/campaigns.proto'),
    ],
    loader: {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    },
    maxReceiveMessageLength: 10 * 1024 * 1024,
    maxSendMessageLength: 10 * 1024 * 1024,
  },
};
