// Public testnet objects only. A local/custom RPC has no assumed public explorer.
export function suiObjectExplorer(network: string, rpc: string, id?: string | null): string | null {
  if (network !== 'testnet' || !id || !/^0x[a-fA-F0-9]{64}$/.test(id) || /^0x0+$/.test(id)) return null;
  try {
    const url = new URL(rpc);
    if (url.protocol !== 'https:' || url.hostname !== `fullnode.${network}.sui.io` || !['', '443'].includes(url.port)) return null;
  } catch { return null; }
  return `https://suiscan.xyz/${network}/object/${id}`;
}
