import { useEffect } from "react";
import { supabase } from "./integrations/supabase/client";

export default function App() {
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, section");

      console.log("DATA:", data);
      console.log("ERROR:", error);
    };

    run();
  }, []);

  return <div>Check Console</div>;
}
