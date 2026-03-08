import { useState, useEffect } from "react";
import { AlertTriangle, XCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

export const SystemStatusBanner = () => {
  const [degraded, setDegraded] = useState(false);
  const [down, setDown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        // Quick DB ping
        const start = performance.now();
        await supabase.from("profiles").select("id").limit(1);
        const latency = performance.now() - start;
        if (latency > 5000) setDown(true);
        else if (latency > 3000) setDegraded(true);
        else { setDegraded(false); setDown(false); }
      } catch {
        setDown(true);
      }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed || (!degraded && !down)) return null;

  const isDown = down;
  return (
    <div className={`fixed top-[57px] left-0 right-0 z-40 px-4 py-2 text-sm flex items-center justify-center gap-2 ${
      isDown 
        ? "bg-destructive/90 text-destructive-foreground" 
        : "bg-yellow-500/90 text-yellow-950"
    }`}>
      {isDown ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      <span>
        {isDown ? "Service disruption detected." : "Some systems are experiencing delays."}
      </span>
      <Link to="/status" className="underline font-medium ml-1">
        View status
      </Link>
      <button onClick={() => setDismissed(true)} className="ml-auto p-0.5 hover:opacity-70">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
