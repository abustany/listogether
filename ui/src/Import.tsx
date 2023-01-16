import { A } from "@solidjs/router";
import { Component, createResource, Match, Switch } from "solid-js";
import { Check } from "./icons/Check";
import styles from "./Import.module.css";
import { useLists } from "./ListStore";

export const Import: Component<{ id: string }> = (props) => {
  const { importList } = useLists();
  const [importedDoc] = createResource(() => importList(props.id));

  return (
    <div class={styles.Wrapper}>
      <div class={styles.Content}>
        <Switch>
          <Match when={importedDoc.loading}>Importing list…</Match>
          <Match when={importedDoc.state === "errored"}>Woops, something went wrong during the import :-/</Match>
          <Match when={importedDoc.state === "ready"}>
            <p>Successfully imported list «{importedDoc()?.name!}» 🥳</p>
            <p>
              <A class={styles.Link} href="/">
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
