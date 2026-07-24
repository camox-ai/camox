export function readHydrationData<T>(): T {
  const script = document.getElementById("__CAMOX_DATA__");
  if (!script?.textContent) {
    throw new Error("Camox runtime hydration data was not found.");
  }

  return JSON.parse(script.textContent) as T;
}
