export function PageWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col">
      <main className={`flex-1 mx-auto w-full px-4 py-8 ${className ?? "max-w-6xl"}`}>
        {children}
      </main>
    </div>
  );
}
