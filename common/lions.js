// はなまらいおん・にじまらいおん の絵。絵は common/img に入っている（はなまらいおん置き場から）。
(function () {
  const base = document.currentScript.src.replace(/[^/]*$/, "") + "img/";
  const FILES = {
    hana: { normal: "hana-normal", think: "hana-think", happy: "hana-happy", idea: "hana-idea", komatta: "hana-komatta" },
    niji: {},
  };

  function svg(kind, mood) {
    const file = FILES[kind][mood || "normal"] || (kind === "niji" ? "niji" : "hana-normal");
    return `<img src="${base}${file}.png" alt="" draggable="false">`;
  }

  // 先に読みこんでおく（表情が変わるときにちらつかないように）
  Object.values(FILES.hana).concat("niji").forEach((f) => { new Image().src = base + f + ".png"; });

  window.Lions = { svg, names: { hana: "はなまらいおん", niji: "にじまらいおん" } };
})();
