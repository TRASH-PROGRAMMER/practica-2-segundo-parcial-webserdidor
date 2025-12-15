import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Microservicio para escuchar eventos de productos
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://user:pass@localhost:5672'],
      queue: 'producto_events',
      queueOptions: { durable: true },
    },
  });

  // Microservicio para responder queries del gateway
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://user:pass@localhost:5672'],
      queue: 'comparador_queue',
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  console.log('🚀 Servicio Comparador escuchando en RabbitMQ (comparador_queue y producto_events)');
}

bootstrap();
