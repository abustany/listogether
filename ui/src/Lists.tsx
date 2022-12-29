import { Component, For, createSignal } from "solid-js";
import { A, useNavigate } from "@solidjs/router";

import { useLists } from "./ListStore";

import styles from "./Lists.module.css";
import { Plus } from "./icons/Plus";
import { Trash2 } from "./icons/Trash2";

const DeleteButton: Component<{ onDelete: () => void }> = (props) => {
  const [confirm, setConfirm] = createSignal(false);
  const onClick = () => {
    if (confirm()) {
      return props.onDelete();
    }

    setConfirm(true);
  };

  return (
    <button
      onclick={onClick}
      onmouseleave={() => {
        setConfirm(false);
      }}
      class={`${styles.DeleteButton} ${confirm() ? styles.DeleteButtonConfirm : undefined}`}
    >
      <Trash2 />
      <span>Click to confirm</span>
    </button>
  );
};

const ListItem: Component<{ id: string; name: string }> = (props) => {
  const { deleteList } = useLists();

  return (
    <li>
      <A href={`/${props.id}`}>{props.name || "(unnamed list)"}</A>
      <DeleteButton
        onDelete={() => {
          deleteList(props.id);
        }}
      />
    </li>
  );
};

export const Lists: Component = () => {
  const { getLists, addList } = useLists();
  const navigate = useNavigate();

  const onAddNewList = () => {
    const listId = addList("New list");
    navigate(`/${listId}`);
  };

  return (
    <ul class={styles.Lists}>
      <For each={getLists()} fallback={<li class={styles.Fallback}>No list yet!</li>}>
        {(item) => <ListItem id={item.id} name={item.name} />}
      </For>
      <li>
        <button onclick={onAddNewList} class={styles.AddButton}>
          <Plus size="1em" />
          Add new list…
        </button>
      </li>
    </ul>
  );
};
