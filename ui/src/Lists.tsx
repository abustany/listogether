import { Component, For, createSignal } from "solid-js";
import { A, useNavigate } from "@solidjs/router";

import { useLists } from "./ListStore";

import styles from "./Lists.module.css";
import { Plus } from "./icons/Plus";
import { Trash2 } from "./icons/Trash2";
import { RefreshCw } from "./icons/RefreshCw";
import { createSlowBoolSignal } from "./slow-bool-signal";
import { Share2 } from "./icons/Share2";
import { Portal } from "solid-js/web";
import { X } from "./icons/X";

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

const ShareButton: Component<{ onShare: () => void }> = (props) => {
  return (
    <button onclick={props.onShare} class={styles.ShareButton}>
      <Share2 />
    </button>
  );
};

const ListItem: Component<{ id: string; name: string; onShare: (id: string) => void }> = (props) => {
  const { deleteList } = useLists();

  return (
    <li>
      <A href={`/${props.id}`}>{props.name || "(unnamed list)"}</A>
      <ShareButton
        onShare={() => {
          props.onShare(props.id);
        }}
      />
      <DeleteButton
        onDelete={() => {
          deleteList(props.id);
        }}
      />
    </li>
  );
};

const ShareModal: Component<{ listId: string; onClose: () => void }> = (props) => {
  return (
    <Portal mount={document.getElementById("portal")!}>
      <div class={styles.ModalOverlay} />
      <div class={styles.ModalOverlayBackdrop} />
      <div class={styles.ModalContainer} onclick={props.onClose}>
        <div
          class={styles.Modal}
          onclick={(ev) => {
            ev.stopPropagation();
          }}
        >
          <header class={styles.ModalHeader}>Share list</header>
          <button onclick={props.onClose} class={styles.ModalClose}>
            <X />
          </button>
          <div class={styles.ModalContent}>
            Share the following link to give read and write access to this list:
            <div class={styles.ListLink}>
              {window.location.origin}/share/{props.listId}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export const Lists: Component = () => {
  const { getLists, addList, isSynchronizing, sync } = useLists();
  const navigate = useNavigate();
  const slowIsSynchronizing = createSlowBoolSignal(isSynchronizing, 1000);
  const [shareModalListId, setShareModalListId] = createSignal<string>();

  const onAddNewList = async () => {
    const listId = await addList("New list");
    navigate(`/${listId}`);
  };

  const onShareList = (id: string) => {
    setShareModalListId(id);
  };

  return (
    <div class={styles.Wrapper}>
      <ul class={styles.Lists}>
        <For each={getLists()} fallback={<li class={styles.Fallback}>No list yet!</li>}>
          {(item) => <ListItem id={item.id} name={item.name} onShare={onShareList} />}
        </For>
        <li>
          <button onclick={onAddNewList} class={styles.AddButton}>
            <Plus size="1em" />
            Add new list…
          </button>
        </li>
      </ul>

      <div class={styles.SyncStatus}>
        <button onclick={sync}>Synchronize now</button>
        {slowIsSynchronizing() && <RefreshCw class={styles.SyncIcon} />}
      </div>

      {shareModalListId() && (
        <ShareModal
          listId={shareModalListId()!}
          onClose={() => {
            setShareModalListId(undefined);
          }}
        />
      )}
    </div>
  );
};
