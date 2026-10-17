"use strict";

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
function closeMenu() {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "打开导航");
  navigation.classList.remove("open");
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  navigation.classList.toggle("open", open);
});
navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
window.matchMedia("(min-width: 701px)").addEventListener("change", (event) => {
  if (event.matches) closeMenu();
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    item.classList.toggle("active", selected);
    document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      activateTab(tabs[next], true);
    }
  });
}

const dialog = document.querySelector(".image-dialog");
const image = document.querySelector("#dialog-image");
const caption = document.querySelector("#dialog-caption");
let opener;
document.querySelectorAll("[data-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const source = button.querySelector("img");
    image.src = source.currentSrc || source.src;
    image.alt = source.alt;
    caption.textContent = button.getAttribute("aria-label").replace(/^放大查看/, "");
    opener = button;
    dialog.showModal();
    document.body.classList.add("dialog-open");
  });
});
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  opener?.focus({ preventScroll: true });
});
