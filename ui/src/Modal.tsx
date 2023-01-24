import { ParentComponent } from "solid-js";
import { Portal } from "solid-js/web";

import { X } from "./icons/X";
import styles from "./Modal.module.css";

export const Modal: ParentComponent<{
  title: string;
  onClose: () => void;
}> = (props) => {
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
          <header class={styles.ModalHeader}>{props.title}</header>
          <button onclick={props.onClose} class={styles.ModalClose}>
            <X />
          </button>
          <div class={styles.ModalContent}>{props.children}</div>
        </div>
      </div>
    </Portal>
  );
};
