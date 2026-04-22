export const cleanValue = (val: any) =>
  val === 'undefined' || val === undefined ? null : val;