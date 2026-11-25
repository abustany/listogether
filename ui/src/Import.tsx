import { A } from "@solidjs/router";
import { Component, createResource, Match, Switch } from "solid-js";
import { Check } from "./icons/Check";
import { useLists } from "./ListStore";
import { useBackToLists } from "./back-to-lists";

export const Import: Component<{ id: string }> = (props) => {
  const { importList } = useLists();
  const [importedDoc] = createResource(() => importList(props.id));
  const backToLists = useBackToLists();

  return (
    <div class="m-0 p-4 flex-1 max-w-[40rem] overflow-auto flex flex-col justify-center">
      <div class="bg-white rounded-[10px] p-4 text-center">
        <Switch>
          <Match when={importedDoc.loading}>Importing list…</Match>
          <Match when={importedDoc.state === "errored"}>Woops, something went wrong during the import :-/</Match>
          <Match when={importedDoc.state === "ready"}>
            <p>Successfully imported list «{importedDoc()?.name ?? ""}» 🥳</p>
            <p>
              <A
                class="border border-black p-[0.4rem] rounded-[4px] inline-flex flex-row items-center gap-[0.2rem] hover:bg-[#eee]"
                href="/"
                onClick={backToLists}
              >
                <Check />
                Back to lists
              </A>
            </p>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
