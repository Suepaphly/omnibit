export function Disclaimer() {
  return (
    <div className="border-t border-canvas-border bg-canvas-raised/80 px-4 py-2 text-center text-xs text-amber-200/90">
      <strong className="font-semibold text-warn">Testnet disclaimer:</strong>{' '}
      tNVDA and tMSFT are <span className="font-medium">synthetic test B20s</span>. They are{' '}
      <span className="font-medium">not</span> Coinbase-issued live tokenized stocks. Omnibit Index
      Forge website is <span className="font-medium">MVP scope</span> — Base Sepolia only,
      unaudited.
    </div>
  );
}
