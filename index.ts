import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import * as functions from 'firebase-functions';
import { AppModule } from './src/app.module';
import { initSwaggerDocs } from 'swagger.init';
import { HttpExceptionFilter } from '@/common/exceptions/exceptions.filter';
import { ResponseInterceptor } from '@/common/response/response.interceptor';
import { TypeORMExceptionFilter } from '@/common/typeorm-exceptions/typeorm-exceptions.filter';
const expressServer = express();
const createFunction = async (expressInstance): Promise<void> => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
    {
      rawBody: true,
      cors: {
        origin: '*',
        credentials: true,
      },
    },
  );
  initSwaggerDocs(app);
  app.useGlobalFilters(new TypeORMExceptionFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();
};
export const api = functions.https.onRequest(async (request, response) => {
  await createFunction(expressServer);
  expressServer(request, response);
});
