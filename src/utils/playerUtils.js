export function cleanName(value) {
  return String(value ?? '').trim().slice(0, 14) || 'Jogador';
}
