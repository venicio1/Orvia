import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0) throw new Error("TRUST_PROXY_HOPS deve ser um inteiro não negativo");
  if (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY_HOPS === undefined) throw new Error("Configure TRUST_PROXY_HOPS para a topologia do proxy de produção");
  app.getHttpAdapter().getInstance().set("trust proxy", proxyHops);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_PUBLIC_URL ?? "http://localhost:3000", credentials: true, allowedHeaders: ["Content-Type", "X-CSRF-Token"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, process.env.API_HOST ?? "127.0.0.1");
}

void bootstrap();
