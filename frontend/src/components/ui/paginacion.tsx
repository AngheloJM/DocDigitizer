"use client";

type PaginaItem = 
   | number
   | "point-inicio"
   | "point-finomgxd";

type PaginaPropi ={
    PaginaActual: number;
    TotalPaginas: number;
    disabled?: boolean;
    cambioPagina: (pagina: number) => void;
}

function crearPaginaItem(
    PaginaActual: number,
    totalPaginas: number,
): PaginaItem[]{
    if (totalPaginas <= 10){
        return Array.from({length: totalPaginas},
            (_, index) => index + 1
        )
    }

    if (PaginaActual <= 5){
        return [
            1,2,3,4,5,6,"point-finomgxd", totalPaginas
        ];
    }

    if (PaginaActual >= totalPaginas - 4){
        return [
            1,"point-inicio", totalPaginas - 5, 
            totalPaginas - 4, totalPaginas - 3, 
            totalPaginas - 2, totalPaginas - 1, totalPaginas
        ];
    }

    return [
        1,"point-inicio", PaginaActual - 2,
        PaginaActual - 1,PaginaActual, 
        PaginaActual + 1, 
        PaginaActual + 2, "point-finomgxd", totalPaginas
    ];
}

export function Pagina ({
    PaginaActual,
    TotalPaginas,
    disabled = false,
    cambioPagina,
}: PaginaPropi){
    if (TotalPaginas <= 1) return null;

    const items = crearPaginaItem(PaginaActual, TotalPaginas,);

    return (
        <nav
        aria-label="Navegación por páginas"
        className="flex flex-wrap items-center justify-center gap-1.5"
        >
            {items.map((item) =>{
                if(typeof item !== "number"){
                    return (
                        <span
                            key={item}
                            aria-hidden = "true"
                            className="px-2 text-sm text-on-surface-variant"
                        >
                            ...
                        </span>
                    );
                }
                const activo = item === PaginaActual;
                return (
                    <button
                      key={item}
                      type="button"
                      aria-label= {`Ir Pagina ${item}`}
                      aria-current={activo? "page": undefined}
                      disabled={disabled || activo}
                      onClick={() => cambioPagina(item)}
                      className= {[
                        "min-w-9 h-9 px-2 rounded-xl",
                        "text-sm font-medium transition-colors",
                        activo?
                        "bg-primary text-white"
                        : "border border-outline-variant text-on-surface hover:bg-surface-container",
                        disabled && !activo
                        ? "opacity-40 cursor-not-allowed"
                        : ""
                      ].join(" ")}
                    >
                        {item}
                    </button>
                );
            })}
        </nav>
//este archivo es nuevo para las paginas
    );
}



