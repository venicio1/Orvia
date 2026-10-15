import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

export async function strictDto<T extends object>(type: new () => T, value: unknown): Promise<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "invalid_input", message: "Verifique os campos informados." });
  const instance = plainToInstance(type, value);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, stopAtFirstError: true });
  if (errors.length) throw new BadRequestException({ code: "invalid_input", message: "Verifique os campos informados." });
  return instance;
}
