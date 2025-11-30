// Common background component with Iceb3rg branding

'use client';

export function Background() {
  return (
    <div 
      className="fixed inset-0 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: 'url(/image.png)',
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-black/40" />
    </div>
  );
}

