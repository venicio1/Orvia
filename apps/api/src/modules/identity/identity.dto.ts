import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { Transform } from "class-transformer";

export class RegisterDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class LoginDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
export class EmailDto { @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsEmail() @MaxLength(320) email!: string; }
export class TokenDto { @IsString() @MinLength(32) @MaxLength(128) token!: string; }
export class ResetPasswordDto extends TokenDto { @IsString() @MinLength(12) @MaxLength(128) password!: string; }

export class ProfileDto {
  @IsOptional() @IsString() @MaxLength(160) professionalName?: string | null;
  @IsOptional() @IsString() @MaxLength(120) profession?: string | null;
  @IsOptional() @IsString() @MaxLength(160) specialty?: string | null;
  @IsOptional() @IsString() @MaxLength(120) city?: string | null;
  @IsOptional() @IsString() @MaxLength(120) region?: string | null;
  @IsOptional() @IsIn(["Presencial", "Online", "Híbrido"]) serviceMode?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) targetAudience?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(120, { each: true }) professionalGoals?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(2400) weeklyTimeMinutes?: number | null;
  @IsOptional() @IsIn(["Estou começando", "Tenho alguma experiência", "Tenho experiência avançada", "Prefiro não informar"]) socialExperience?: string | null;
  @IsOptional() @IsIn(["Ainda não publico", "Menos de uma vez por semana", "1 a 2 vezes por semana", "3 ou mais vezes por semana", "Prefiro não informar"]) postingFrequency?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(8) @IsIn(["Orientação direta", "Tom acolhedor", "Linguagem técnica", "Mensagens objetivas"], { each: true }) communicationPreferences?: string[];
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(5) onboardingStep?: number;
  @IsOptional() @IsBoolean() completeOnboarding?: boolean;
}
