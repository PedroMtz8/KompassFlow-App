/** Distingue un resultado de servicio fallido (`{ error }`) de uno exitoso, con el tipo correctamente estrechado. */
export const hasError = <T extends object>(r: T): r is Extract<T, { error: string }> => 'error' in r;
