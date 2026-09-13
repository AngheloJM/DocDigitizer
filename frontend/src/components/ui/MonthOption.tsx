type MonthOptionsProps = {
    allowEmpty: boolean;
    emptyLabel?: string;
    min?: number;
    max?: number;
};

const MONTH_NAMES= [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
];
export function MonthOptions({
    allowEmpty,
    emptyLabel = "Sin Especificar",
    min = 1,
    max= 12
}: MonthOptionsProps){
    return(
        <>
        <option value= "" disabled= {!allowEmpty}>
            {emptyLabel}
        </option>
        {MONTH_NAMES.map((label, index) => {
            const value = index +1;
            return (
                <option key={value} value={value} disabled= {value < min || value > max}>
                    {label}
                </option>
            );})}

        </>
    );
}