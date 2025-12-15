import { 
  Controller, 
  Post, 
  Body, 
  Headers, 
  HttpException, 
  HttpStatus, 
  Logger,
  Get
} from '@nestjs/common';
import { HmacSignatureService } from './hmac-signature.service';

/**
 * Controlador de Webhooks con validación HMAC integrada
 * 
 * Endpoints para recibir webhooks de sistemas externos con:
 * - Validación automática de firmas HMAC-SHA256
 * - Prevención de replay attacks
 * - Idempotencia
 * - Respuestas rápidas (< 30s)
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly processedEvents = new Set<string>();

  constructor(
    private readonly hmacService: HmacSignatureService
  ) {}

  /**
   * Health check del sistema de webhooks
   * GET /webhook/health
   */
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'webhook-receiver',
      timestamp: new Date().toISOString(),
      hmac: this.hmacService.healthCheck(),
    };
  }

  /**
   * Endpoint para recibir webhooks de prescripciones
   * POST /webhook/prescripcion
   * 
   * Headers requeridos:
   * - X-Webhook-Signature: sha256=<firma_hmac>
   * - X-Webhook-Timestamp: <timestamp_unix_ms>
   * - X-Event-ID: <id_unico_evento>
   */
  @Post('prescripcion')
  async handlePrescripcionWebhook(
    @Body() payload: any,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-event-id') eventId: string,
  ) {
    try {
      // 1. Validar estructura básica del payload
      this.validatePayloadStructure(payload, 'prescripcion.registrada');

      // 2. Validar firma HMAC
      const timestampNum = timestamp ? parseInt(timestamp, 10) : undefined;
      if (!this.hmacService.validateSignature(payload, signature, timestampNum)) {
        this.logger.warn(`Firma HMAC inválida para evento: ${eventId}`);
        throw new HttpException(
          {
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Firma de webhook inválida',
            error: 'Invalid HMAC signature',
            event_id: eventId,
          },
          HttpStatus.UNAUTHORIZED
        );
      }

      // 3. Verificar idempotencia (prevenir duplicados)
      if (this.isEventProcessed(payload.event_id)) {
        this.logger.warn(`Evento duplicado ignorado: ${payload.event_id}`);
        return {
          status: 'duplicate',
          message: 'Evento ya procesado anteriormente',
          event_id: payload.event_id,
          processed_at: new Date().toISOString(),
        };
      }

      // 4. Procesar webhook
      this.logger.log(`Procesando prescripcion.registrada: ${payload.event_id}`);
      
      // TODO: Implementar lógica de negocio específica
      await this.processPrescripcionRegistrada(payload);

      // 5. Marcar como procesado
      this.markEventAsProcessed(payload.event_id);

      // 6. Responder exitosamente
      return {
        status: 'success',
        message: 'Webhook procesado correctamente',
        event_id: payload.event_id,
        processed_at: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Error procesando webhook de prescripción:', error);

      // Distinguir entre errores permanentes (4xx) y temporales (5xx)
      if (error instanceof HttpException) {
        throw error;
      }

      // Error temporal: indicar al emisor que puede reintentar
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Error temporal procesando webhook',
          error: 'Service Unavailable',
          event_id: payload?.event_id,
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Endpoint para recibir webhooks de comparaciones
   * POST /webhook/comparacion
   */
  @Post('comparacion')
  async handleComparacionWebhook(
    @Body() payload: any,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-event-id') eventId: string,
  ) {
    try {
      // 1. Validar estructura básica
      this.validatePayloadStructure(payload, 'comparacion.realizada');

      // 2. Validar firma HMAC
      const timestampNum = timestamp ? parseInt(timestamp, 10) : undefined;
      if (!this.hmacService.validateSignature(payload, signature, timestampNum)) {
        this.logger.warn(`Firma HMAC inválida para evento: ${eventId}`);
        throw new HttpException(
          {
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Firma de webhook inválida',
            error: 'Invalid HMAC signature',
            event_id: eventId,
          },
          HttpStatus.UNAUTHORIZED
        );
      }

      // 3. Verificar idempotencia
      if (this.isEventProcessed(payload.event_id)) {
        this.logger.warn(`Evento duplicado ignorado: ${payload.event_id}`);
        return {
          status: 'duplicate',
          message: 'Evento ya procesado anteriormente',
          event_id: payload.event_id,
          processed_at: new Date().toISOString(),
        };
      }

      // 4. Procesar webhook
      this.logger.log(`Procesando comparacion.realizada: ${payload.event_id}`);
      
      // TODO: Implementar lógica de negocio específica
      await this.processComparacionRealizada(payload);

      // 5. Marcar como procesado
      this.markEventAsProcessed(payload.event_id);

      // 6. Responder exitosamente
      return {
        status: 'success',
        message: 'Webhook procesado correctamente',
        event_id: payload.event_id,
        processed_at: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Error procesando webhook de comparación:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Error temporal procesando webhook',
          error: 'Service Unavailable',
          event_id: payload?.event_id,
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  /**
   * Endpoint de prueba para generar firma HMAC
   * POST /webhook/generate-signature
   * 
   * Útil para testing y desarrollo
   */
  @Post('generate-signature')
  generateSignature(@Body() payload: any) {
    const timestamp = Date.now();
    const signature = this.hmacService.generateSignature(payload, timestamp);
    const headers = this.hmacService.generateWebhookHeaders(payload);

    return {
      payload,
      signature,
      timestamp,
      headers,
      instructions: {
        usage: 'Usa estos headers al enviar el webhook',
        example: `curl -X POST http://localhost:3002/webhook/prescripcion \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Signature: ${signature}" \\
  -H "X-Webhook-Timestamp: ${timestamp}" \\
  -H "X-Event-ID: ${payload.event_id || 'test-event-123'}" \\
  -d '${JSON.stringify(payload)}'`
      }
    };
  }

  /**
   * Valida la estructura básica de un payload
   */
  private validatePayloadStructure(payload: any, expectedEventType: string): void {
    if (!payload) {
      throw new HttpException(
        'Payload vacío o inválido',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!payload.event_type || !payload.event_id || !payload.data) {
      throw new HttpException(
        'Payload inválido: campos requeridos faltantes (event_type, event_id, data)',
        HttpStatus.BAD_REQUEST
      );
    }

    if (payload.event_type !== expectedEventType) {
      throw new HttpException(
        `Tipo de evento inesperado: ${payload.event_type} (esperado: ${expectedEventType})`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Verifica si un evento ya fue procesado (idempotencia)
   */
  private isEventProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Marca un evento como procesado
   * En producción, usar Redis con TTL de 7 días
   */
  private markEventAsProcessed(eventId: string): void {
    this.processedEvents.add(eventId);
    
    // Limpiar eventos antiguos después de 1 hora (en memoria)
    setTimeout(() => {
      this.processedEvents.delete(eventId);
    }, 60 * 60 * 1000);
  }

  /**
   * Procesa prescripción registrada
   * TODO: Implementar lógica de negocio específica
   */
  private async processPrescripcionRegistrada(payload: any): Promise<void> {
    const { data } = payload;
    
    this.logger.log(`Prescripción #${data.id_prescripcion} para paciente: ${data.nombre_paciente}`);
    this.logger.log(`Medicamentos: ${data.medicamentos.length}`);
    
    // Aquí implementar:
    // - Enviar notificaciones
    // - Reservar stock
    // - Actualizar base de datos
    // - Generar reportes
    // etc.
  }

  /**
   * Procesa comparación realizada
   * TODO: Implementar lógica de negocio específica
   */
  private async processComparacionRealizada(payload: any): Promise<void> {
    const { data } = payload;
    
    this.logger.log(`Comparación para producto: ${data.nombre_producto}`);
    this.logger.log(`Ahorro potencial: ${data.ahorro_potencial}%`);
    
    // Aquí implementar:
    // - Actualizar analytics
    // - Enviar alertas de ahorro
    // - Actualizar dashboard
    // etc.
  }
}
