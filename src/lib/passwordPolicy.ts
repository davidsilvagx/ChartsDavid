export function passwordRules(password: string) {
  return [
    {label:'Pelo menos 12 caracteres',met:password.length>=12},
    {label:'Uma letra maiúscula',met:/[A-Z]/.test(password)},
    {label:'Uma letra minúscula',met:/[a-z]/.test(password)},
    {label:'Um número',met:/[0-9]/.test(password)},
    {label:'Um símbolo, como ! @ # $',met:[...password].some(c=>"!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~".includes(c))},
    {label:'Até 72 bytes (limite seguro da senha)',met:new TextEncoder().encode(password).length<=72},
  ];
}
export const validPassword = (password:string) => passwordRules(password).every(rule=>rule.met);
