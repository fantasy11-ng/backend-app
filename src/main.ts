import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/exceptions/exceptions.filter';
import { ResponseInterceptor } from './common/response/response.interceptor';
import { TypeORMExceptionFilter } from './common/typeorm-exceptions/typeorm-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      origin: '*',
      credentials: true,
    },
  });
  app.useGlobalFilters(new TypeORMExceptionFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // swagger setup
  const config = new DocumentBuilder()
    .setTitle('Fantasy 11 API Documentation')
    .setDescription('The official API documentation for Fabtasy 11 backend')
    .setVersion('1.0')
    .addTag('fantasy 11')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
    ],
  });

  (await app).listen(3000);
}
bootstrap();
