"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, loginRequest } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";

const schema = z.object({
  email: z.string().email("Ingresa un email válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await loginRequest(values.email, values.password);
      router.replace("/carpetas");
      router.refresh();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "No se pudo iniciar sesión");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container p-5 md:p-16 antialiased">
      <div className="w-full max-w-5xl flex flex-col md:flex-row bg-white rounded-2xl overflow-hidden border border-outline-variant shadow-[0_8px_40px_rgba(207,21,45,0.12)]">
        <section className="hidden md:flex md:w-1/2 flex-col justify-between p-10 text-white relative overflow-hidden min-h-[520px]">
          <img
            src="/campus-utepsa.webp"
            alt="Campus UTEPSA"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/40" />

          <div className="relative z-10">
            <img
              src="/logo-utepsa.png?v=3"
              alt="UTEPSA"
              className="h-14 w-auto max-w-[280px] object-contain drop-shadow-md"
            />
          </div>

          <div className="relative z-10 mt-auto">
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary font-semibold mb-3">
              Plataforma Institucional · UTEPSA
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-4">
              Gestión Documental
            </h2>
            <div className="h-1 w-14 rounded-full bg-secondary mb-5" />
            <p className="text-base text-white/90 max-w-md leading-relaxed">
              Use su correo y contraseña institucionales.
            </p>
          </div>
        </section>

        <section className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="md:hidden mb-8 bg-primary rounded-2xl px-4 py-5 flex justify-center">
            <img
              src="/logo-utepsa.png?v=3"
              alt="UTEPSA"
              className="h-12 w-auto max-w-[240px] object-contain"
            />
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-2xl md:text-[32px] font-semibold tracking-tight text-on-surface mb-2">
              Iniciar sesión
            </h1>
            <p className="text-sm text-on-surface-variant">
              Ingrese sus credenciales institucionales.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label
                htmlFor="email"
                className="block text-[11px] font-bold uppercase tracking-wider text-on-surface mb-2"
              >
                Correo institucional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon name="mail" className="text-xl text-on-surface-variant" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="block w-full pl-11 pr-4 py-3 border border-outline rounded-2xl bg-surface-variant text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none placeholder:text-on-surface-variant/60 transition-colors"
                  placeholder="usuario@utepsa.edu.bo"
                  {...register("email")}
                />
              </div>
              {errors.email && <p className="text-xs text-error mt-1.5">{errors.email.message}</p>}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[11px] font-bold uppercase tracking-wider text-on-surface mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon name="lock" className="text-xl text-on-surface-variant" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="block w-full pl-11 pr-12 py-3 border border-outline rounded-2xl bg-surface-variant text-on-surface text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none placeholder:text-on-surface-variant/60 transition-colors"
                  placeholder="••••••••"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-xl" />
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-error mt-1.5">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="bg-error-container text-error text-sm rounded-2xl px-3 py-2.5">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-semibold transition-colors disabled:opacity-60 shadow-sm"
            >
              {isSubmitting ? "Ingresando..." : "Ingresar"}
              {!isSubmitting && <Icon name="login" className="text-xl" />}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
