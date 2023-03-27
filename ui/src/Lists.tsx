import { Component, For, createSignal, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";

import { useLists } from "./ListStore";
import styles from "./Lists.module.css";
import { Plus } from "./icons/Plus";
import { Trash2 } from "./icons/Trash2";
import { Share2 } from "./icons/Share2";
import { SyncStatus } from "./SyncStatus";
import { Link } from "./icons/Link";
import { Modal } from "./Modal";

const DeleteButton: Component<{ onDelete: () => void }> = (props) => {
  const [confirm, setConfirm] = createSignal(false);
  const onClick = () => {
    if (confirm()) {
      return props.onDelete();
    }

    setConfirm(true);
  };
  const deleteThisList = "Delete this list";
  const clickToConfirm = "Click to confirm";

  return (
    <button
      onclick={onClick}
      onmouseleave={() => {
        setConfirm(false);
      }}
      class={`${styles.TextButton} ${styles.ToolButton} ${styles.DeleteButton} ${
        confirm() ? styles.DeleteButtonConfirm : undefined
      }`}
      title={deleteThisList}
      aria-label={confirm() ? clickToConfirm : deleteThisList}
    >
      <Trash2 />
      <span>{clickToConfirm}</span>
    </button>
  );
};

const ShareButton: Component<{ onShare: () => void }> = (props) => {
  return (
    <button onclick={props.onShare} class={`${styles.TextButton} ${styles.ToolButton}`} title="Share this list">
      <Share2 />
    </button>
  );
};

const ImportButton: Component<{ onImport: () => void }> = (props) => {
  return (
    <button
      onclick={props.onImport}
      class={`${styles.TextButton} ${styles.ToolButton}`}
      title="Import a list from a URL"
    >
      <Link size="1em" /> Import a list…
    </button>
  );
};

const ListItem: Component<{ id: string; name: string; onShare: (id: string) => void }> = (props) => {
  const { deleteList } = useLists();
  const linkId = `list-item-${props.id}`;

  return (
    <li aria-labelledby={linkId}>
      <A id={linkId} href={`/${props.id}`}>
        {props.name || "(unnamed list)"}
      </A>
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

const listImportUrl = (listId: string) => `${window.location.origin}/import/${listId}`;

const ShareModal: Component<{ listId: string; onClose: () => void }> = (props) => {
  const importURL = listImportUrl(props.listId);
  const [copied, setCopied] = createSignal(false);
  const onLinkClick = async () => {
    try {
      await navigator.clipboard.writeText(importURL);
      setCopied(true);
    } catch (_ignored) {}
  };

  return (
    <Modal title="Share list" onClose={props.onClose}>
      Share the following link to give read and write access to this list. Click on the link to copy it to the
      clipboard.
      <div class={styles.ListLink} onclick={onLinkClick}>
        {importURL}
      </div>
      <Show when={copied()}>Link copied to clipboard!</Show>
    </Modal>
  );
};

const ImportModal: Component<{ onClose: () => void }> = (props) => {
  const navigate = useNavigate();
  const [getUrl, setUrl] = createSignal<string>();
  const onImport = () => {
    const url = getUrl();
    if (!url) return;

    const expectedPrefix = listImportUrl("");
    if (url.indexOf(expectedPrefix) !== 0) return;

    const listId = url.slice(expectedPrefix.length);
    navigate(`/import/${listId}`);
  };
  return (
    <Modal title="Import list" onClose={props.onClose}>
      <input
        type="text"
        placeholder="Sharing URL"
        onchange={(ev) => {
          setUrl((ev.target as HTMLInputElement).value);
        }}
      />
      <button class={styles.ImportButton} onclick={onImport}>
        Import
      </button>
    </Modal>
  );
};

export const Lists: Component = () => {
  const { getLists, addList } = useLists();
  const navigate = useNavigate();
  const [shareModalListId, setShareModalListId] = createSignal<string>();
  const [showImportModal, setShowImportModal] = createSignal(false);

  const onAddNewList = async () => {
    const listId = await addList("New list");
    navigate(`/${listId}`);
  };

  const onShareList = (id: string) => {
    setShareModalListId(id);
  };

  const onImportList = () => {
    setShowImportModal(true);
  };

  return (
    <div class={styles.Wrapper}>
      <ul class={styles.Lists}>
        <For each={getLists()} fallback={<li class={styles.Fallback}>No list yet!</li>}>
          {(item) => <ListItem id={item.id} name={item.name} onShare={onShareList} />}
        </For>
        <li>
          <button onclick={onAddNewList} class={`${styles.TextButton} ${styles.AddButton}`}>
            <Plus size="1em" />
            New list…
          </button>
          <ImportButton onImport={onImportList} />
        </li>
      </ul>

      <div class={styles.SyncStatus}>
        <SyncStatus />
      </div>

      <Show when={shareModalListId()}>
        <ShareModal
          listId={shareModalListId()!}
          onClose={() => {
            setShareModalListId(undefined);
          }}
        />
      </Show>

      <Show when={showImportModal()}>
        <ImportModal
          onClose={() => {
            setShowImportModal(false);
          }}
        />
      </Show>
    </div>
  );
};
