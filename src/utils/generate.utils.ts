export const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateTempPassword = (): string => {
  return Math.random().toString(36).slice(-8) + "@Tmp1";
};