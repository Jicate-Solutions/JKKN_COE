export function AppFooter() {
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="container flex h-14 items-center justify-center px-4">
        <p className="text-xs text-muted-foreground">
          Developed by JKKN Educational Institution © {new Date().getFullYear()}. All Rights Reserved.
        </p>
      </div>
    </footer>
  )
}