/** Compact testnet banner — used where a standalone strip is needed. */
export function Disclaimer() {
  return (
    <div className="border-t border-canvas-border/80 bg-canvas-raised/90 px-4 py-3 text-center text-xs leading-relaxed text-amber-100/85 backdrop-blur-sm">
      <strong className="font-semibold text-accretion-soft">Testnet disclaimer:</strong>{' '}
      tNVDA and tMSFT are <span className="font-medium text-amber-50">synthetic test B20s</span>. They
      are <span className="font-medium text-amber-50">not</span> Coinbase-issued live tokenized stocks.
      Omnibit Index Forge is <span className="font-medium text-amber-50">MVP scope</span> — Base
      Sepolia only, unaudited.
    </div>
  );
}
