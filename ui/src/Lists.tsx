import { Component, For, createSignal, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";

import { useLists } from "./ListStore";
import { Plus } from "./icons/Plus";
import { Trash2 } from "./icons/Trash2";
import { Share2 } from "./icons/Share2";
import { SyncStatus } from "./SyncStatus";
import { Link } from "./icons/Link";
import { Modal } from "./Modal";
import { cn } from "./cn";

const textButton =
  "text-inherit border-0 bg-transparent text-left cursor-pointer font-[inherit] flex items-center gap-[0.2rem]";
const toolButton = "flex-none border-l border-l-[#ccc]";
const listLi =
  "border-t border-t-[#ddd] border-x-2 border-x-[#bbb] border-b-0 bg-white flex items-center overflow-hidden first:border-t-2 first:border-t-[#bbb] first:rounded-t-[10px] last:border-b-2 last:border-b-[#bbb] last:rounded-b-[10px]";

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
      class={cn(
        textButton,
        toolButton,
        "p-4 [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>span]:max-w-0 delete-btn",
        confirm() && "delete-btn-confirm text-white bg-[#b00] [&>span]:max-w-[20em]",
      )}
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
    <button onclick={props.onShare} class={cn(textButton, toolButton, "p-4")} title="Share this list">
      <Share2 />
    </button>
  );
};

const ImportButton: Component<{ onImport: () => void }> = (props) => {
  return (
    <button onclick={props.onImport} class={cn(textButton, toolButton, "p-4")} title="Import a list from a URL">
      <Link size="1em" /> Import a list…
    </button>
  );
};

const ListItem: Component<{
  id: string;
  name: string;
  onShare: (id: string) => void;
}> = (props) => {
  const { deleteList } = useLists();
  const linkId = `list-item-${props.id}`;

  return (
    <li class={listLi} aria-labelledby={linkId}>
      <A id={linkId} class="flex-[1_1_100%] p-4" href={`/${props.id}`}>
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
    } catch {}
  };

  return (
    <Modal title="Share list" onClose={props.onClose}>
      Share the following link to give read and write access to this list. Click on the link to copy it to the
      clipboard.
      <div class="font-mono bg-[#ddd] p-2 cursor-pointer" onclick={onLinkClick} aria-label="List share URL">
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
        class="border border-gray-500 px-2 py-1 rounded"
        onchange={(ev) => {
          setUrl((ev.target as HTMLInputElement).value);
        }}
      />
      <button class="self-end border px-2 py-1 rounded border-black" onclick={onImport}>
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
    <div class="m-0 p-4 flex-1 max-w-[40rem] overflow-auto flex flex-col">
      <ul class="flex-none list-none p-0 m-0" aria-label="Lists">
        <For each={getLists()} fallback={<li class={cn(listLi, "p-4 justify-center")}>No list yet!</li>}>
          {(item) => <ListItem id={item.id} name={item.name} onShare={onShareList} />}
        </For>
        <li class={listLi}>
          <button onclick={onAddNewList} class={cn(textButton, "flex-[1_1_100%] p-4")}>
            <Plus size="1em" />
            New list…
          </button>
          <ImportButton onImport={onImportList} />
        </li>
      </ul>

      <div class="flex-none">
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
