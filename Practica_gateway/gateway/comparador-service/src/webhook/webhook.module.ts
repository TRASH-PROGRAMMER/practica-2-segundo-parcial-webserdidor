import { Module } from '@nestjs/common';
import { HmacSignatureService } from './hmac-signature.service';
import { WebhookController } from './webhook.controller';
import { HmacValidationMiddleware } from './hmac-validation.middleware';

/**
 * Módulo de Webhooks con soporte HMAC
 * 
 * Proporciona:
 * - Servicios de generación y validación de firmas HMAC
 * - Controladores para recibir webhooks
 * - Middleware para validación automática
 */
@Module({
  controllers: [WebhookController],
  providers: [
    HmacSignatureService,
    HmacValidationMiddleware,
  ],
  exports: [
    HmacSignatureService,
    HmacValidationMiddleware,
  ],
})
export class WebhookModule {}
