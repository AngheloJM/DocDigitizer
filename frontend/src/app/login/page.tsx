"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, loginRequest } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Ingresa un email válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
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
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <section className="hidden lg:flex flex-col justify-between bg-header text-white p-12">
        <img src="/logo-utepsa.png" alt="UTEPSA" className="h-12 w-auto max-w-[280px] object-contain object-left" />
        <div>
          <h2 className="text-4xl font-semibold tracking-tight max-w-md">Digitaliza y organiza el archivo institucional.</h2>
        </div>
        <p className="text-xs text-white/60">DocDigitizer · Archivo central</p>
      </section>

      <section className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 bg-header rounded-lg px-4 py-3">
            <img src="/logo-utepsa.png" alt="UTEPSA" className="h-9 w-auto max-w-[220px] object-contain object-left" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-on-surface mb-8">Iniciar sesión</h1>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                placeholder="usuario@utepsa.edu.bo"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-error mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1.5 font-medium">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                {...register("password")}
              />
              {errors.password && <p className="text-xs text-error mt-1">{errors.password.message}</p>}
            </div>

            {serverError && (
              <div className="bg-error-container text-error text-sm rounded-lg px-3 py-2">{serverError}</div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-white text-sm font-medium py-2.5 px-4 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "Ingresando..." : "Entrar"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
