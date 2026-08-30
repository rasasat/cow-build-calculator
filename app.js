/* Call of War — Build & Economy Calculator */
(function () {
  "use strict";
  var D = window.COW_DATA;
  var RES = ["food", "metal", "oil", "manpower", "money"];
  var fmt = function (n) { return Math.round(n).toLocaleString("en-US"); };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- derive lookups ---------- */
  var factions = uniq(D.units.map(function (u) { return u.faction; }));
  var scenarioNames = Object.keys(D.scenarios);

  // type -> {faction -> {level -> unit}}
  var unitIndex = {};
  D.units.forEach(function (u) {
    (unitIndex[u.type] = unitIndex[u.type] || {});
    (unitIndex[u.type][u.faction] = unitIndex[u.type][u.faction] || {});
    unitIndex[u.type][u.faction][u.level] = u;
  });
  var buildingIndex = {};
  D.buildings.forEach(function (b) {
    (buildingIndex[b.type] = buildingIndex[b.type] || {});
    buildingIndex[b.type][b.level] = b;
  });
  var buildingTypes = Object.keys(buildingIndex).sort();

  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  // Wiki unit categories (order and grouping per wiki.callofwar.com/wiki/UNITS)
  var UNIT_CATEGORIES = [
    { name: "Infantry", types: ["Militia", "Infantry", "Motorized Infantry", "Mechanized Infantry", "Commandos", "Paratroopers (Aircraft)", "Paratroopers (Infantry)"] },
    { name: "Ordnance", types: ["Anti Tank", "Artillery", "SP Artillery", "Anti Air", "SP Anti Air"] },
    { name: "Tanks", types: ["Armored Car", "Light Tank", "Medium Tank", "Heavy Tank", "Tank Destroyer"] },
    { name: "Aircraft", types: ["Interceptor", "Tactical Bomber", "Attack Bomber", "Strategic Bomber", "Naval Bomber", "Aircraft Transport"] },
    { name: "Naval", types: ["Destroyer", "Submarine", "Cruiser", "Battleship", "Aircraft Carrier", "Transport Ship"] },
    { name: "Secret", types: ["Rocket Artillery", "SP Rocket Artillery", "Railroad Gun", "Flying Bomb", "Rocket", "Rocket Fighter", "Nuclear Bomber", "Nuclear Rocket"] }
  ];

  /* ---------- state ---------- */
  var items = []; // {kind,type,faction,level,qty}
  var currentFaction = factions.indexOf("Base") >= 0 ? "Base" : factions[0];

  /* ================= TABS ================= */
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      $(t.dataset.tab).classList.add("active");
    });
  });

  /* ================= BUILD COST ================= */
  function fillFactionSelect() {
    var s = $("faction");
    s.innerHTML = factions.map(function (f) { return "<option>" + f + "</option>"; }).join("");
    s.value = currentFaction;
  }

  // types available for the current kind + faction
  function typesFor(kind) {
    if (kind === "building") return buildingTypes;
    return Object.keys(unitIndex).filter(function (t) {
      return unitIndex[t][currentFaction];
    }).sort();
  }

  function fillTypeSelect() {
    var kind = $("add-kind").value;
    if (kind === "building") {
      $("add-type").innerHTML = buildingTypes.map(function (t) { return "<option>" + t + "</option>"; }).join("");
      fillLevelSelect();
      return;
    }
    // units: group by wiki category with <optgroup>
    var avail = {};
    typesFor("unit").forEach(function (t) { avail[t] = true; });
    var html = "";
    var placed = {};
    UNIT_CATEGORIES.forEach(function (cat) {
      var opts = cat.types.filter(function (t) { placed[t] = true; return avail[t]; })
        .map(function (t) { return "<option>" + t + "</option>"; }).join("");
      if (opts) html += "<optgroup label='" + cat.name + "'>" + opts + "</optgroup>";
    });
    // safety net: any available unit not listed in a category
    var leftovers = Object.keys(avail).filter(function (t) { return !placed[t]; }).sort()
      .map(function (t) { return "<option>" + t + "</option>"; }).join("");
    if (leftovers) html += "<optgroup label='Other'>" + leftovers + "</optgroup>";
    $("add-type").innerHTML = html;
    fillLevelSelect();
  }

  function levelsFor(kind, type) {
    if (kind === "building") return Object.keys(buildingIndex[type] || {}).map(Number).sort(function (a, b) { return a - b; });
    var byF = (unitIndex[type] || {})[currentFaction] || {};
    return Object.keys(byF).map(Number).sort(function (a, b) { return a - b; });
  }

  function fillLevelSelect() {
    var kind = $("add-kind").value;
    var type = $("add-type").value;
    var levels = levelsFor(kind, type);
    $("add-level").innerHTML = levels.map(function (l) { return "<option value='" + l + "'>Lvl " + l + "</option>"; }).join("");
  }

  function lookup(kind, type, faction, level) {
    if (kind === "building") return (buildingIndex[type] || {})[level];
    return (((unitIndex[type] || {})[faction] || {})[level]);
  }

  function addItem() {
    var kind = $("add-kind").value;
    var type = $("add-type").value;
    var level = parseInt($("add-level").value, 10);
    var qty = Math.max(1, parseInt($("add-qty").value, 10) || 1);
    if (!type) return;
    var faction = kind === "building" ? "" : currentFaction;
    // merge if identical row exists
    var existing = items.find(function (it) {
      return it.kind === kind && it.type === type && it.level === level && it.faction === faction;
    });
    if (existing) existing.qty += qty;
    else items.push({ kind: kind, type: type, faction: faction, level: level, qty: qty });
    render();
  }

  function removeItem(i) { items.splice(i, 1); render(); }

  function render() {
    var body = $("items-body");
    var table = $("items-table");
    var hint = $("empty-hint");
    var clearBtn = $("clear-btn");
    var totals = { food: 0, metal: 0, oil: 0, manpower: 0, money: 0 };
    var unitCount = 0;

    if (!items.length) {
      table.classList.add("hidden");
      hint.classList.remove("hidden");
      clearBtn.classList.add("hidden");
    } else {
      table.classList.remove("hidden");
      hint.classList.add("hidden");
      clearBtn.classList.remove("hidden");
    }

    body.innerHTML = items.map(function (it, i) {
      var d = lookup(it.kind, it.type, it.faction, it.level) || {};
      RES.forEach(function (r) { totals[r] += (d[r] || 0) * it.qty; });
      unitCount += it.qty;
      var sub = it.kind === "building" ? "Building · Lvl " + it.level : it.faction + " · Lvl " + it.level;
      return "<tr>" +
        "<td><div class='item-name'>" + it.type + "</div><div class='item-sub'>" + sub + "</div></td>" +
        "<td class='num'>" + it.qty + "</td>" +
        "<td class='num'>" + fmt((d.food || 0) * it.qty) + "</td>" +
        "<td class='num'>" + fmt((d.metal || 0) * it.qty) + "</td>" +
        "<td class='num'>" + fmt((d.oil || 0) * it.qty) + "</td>" +
        "<td class='num'>" + fmt((d.manpower || 0) * it.qty) + "</td>" +
        "<td class='num'>" + fmt((d.money || 0) * it.qty) + "</td>" +
        "<td><button class='row-del' data-i='" + i + "' title='Remove'>✕</button></td>" +
        "</tr>";
    }).join("");

    $("t-food").textContent = fmt(totals.food);
    $("t-metal").textContent = fmt(totals.metal);
    $("t-oil").textContent = fmt(totals.oil);
    $("t-manpower").textContent = fmt(totals.manpower);
    $("t-money").textContent = fmt(totals.money);
    $("t-units").textContent = fmt(unitCount);

    window._totals = totals;
    renderAfford();
  }

  /* ================= DAYS TO AFFORD ================= */
  function fillAffordScenarios() {
    $("af-scenario").innerHTML = "<option value=''>—</option>" +
      scenarioNames.map(function (n) { return "<option>" + n + "</option>"; }).join("");
  }
  function fillAffordNations() {
    var sc = $("af-scenario").value;
    var sel = $("af-nation");
    if (!sc) { sel.innerHTML = "<option value=''>—</option>"; renderAfford(); return; }
    var nations = D.scenarios[sc].nations;
    sel.innerHTML = "<option value=''>—</option>" +
      nations.map(function (n) { return "<option>" + n.nation + "</option>"; }).join("");
    renderAfford();
  }

  function renderAfford() {
    var out = $("afford-result");
    var sc = $("af-scenario").value, nat = $("af-nation").value;
    var totals = window._totals || {};
    var anyCost = RES.some(function (r) { return (totals[r] || 0) > 0; });
    if (!sc || !nat) { out.className = "afford-result muted"; out.textContent = "Pick a scenario and nation."; return; }
    if (!anyCost) { out.className = "afford-result muted"; out.textContent = "Add items to your build first."; return; }

    var prod = D.scenarios[sc].nations.find(function (n) { return n.nation === nat; });
    var speed = D.scenarios[sc].speed || "1x";
    var rows = RES.map(function (r) {
      var cost = totals[r] || 0;
      var per = prod[r] || 0;
      var days = cost <= 0 ? 0 : (per <= 0 ? Infinity : cost / per);
      return { r: r, cost: cost, per: per, days: days };
    }).filter(function (x) { return x.cost > 0; });

    var maxDays = rows.reduce(function (m, x) { return x.days > m ? x.days : m; }, 0);
    var icon = { food: "🍞", metal: "⚙️", oil: "🛢️", manpower: "👥", money: "💰" };
    var label = { food: "Food", metal: "Metal", oil: "Oil", manpower: "Manpower", money: "Money" };

    var headline = isFinite(maxDays)
      ? "<div class='afford-headline'>At " + nat + "'s starting economy, this build takes about <b>" +
        (maxDays < 1 ? "<1" : maxDays.toFixed(1)) + " day" + (maxDays >= 1.05 ? "s" : "") +
        "</b> of full production.<div class='muted small'>" + sc + " · " + speed + " speed</div></div>"
      : "<div class='afford-headline'>This nation produces no <b>" +
        rows.filter(function (x) { return !isFinite(x.days); }).map(function (x) { return label[x.r]; }).join(", ") +
        "</b> at start — you'd need trade or provinces.</div>";

    var list = rows.map(function (x) {
      var d = !isFinite(x.days) ? "∞" : (x.days < 1 ? "<1" : x.days.toFixed(1));
      var bottleneck = x.days === maxDays && rows.length > 1;
      return "<li class='" + (bottleneck ? "bottleneck" : "") + "'>" +
        "<span>" + icon[x.r] + "</span><span>" + label[x.r] + "</span>" +
        "<span class='muted small'>" + fmt(x.per) + "/day</span>" +
        "<span class='a-days'>" + d + " d</span></li>";
    }).join("");

    out.className = "afford-result";
    out.innerHTML = headline + "<ul class='afford-list'>" + list + "</ul>" +
      "<p class='muted small'>Slowest resource (highlighted) is your bottleneck.</p>";
  }

  /* ================= ECONOMY BROWSER ================= */
  var econSort = { key: "money", asc: false };
  var REGION_ORDER = ["North America", "Central America", "South America", "Europe", "Middle East", "North Africa", "Southern Africa", "Russia", "Asia", "Southeast Asia", "Oceania"];
  function fillEconScenarios() {
    $("ec-scenario").innerHTML = scenarioNames.map(function (n) { return "<option>" + n + "</option>"; }).join("");
  }
  function renderEcon() {
    var sc = $("ec-scenario").value;
    var data = D.scenarios[sc];
    var facFilter = $("ec-faction").value;
    var hasRoles = data.nations.some(function (n) { return n.role; });
    $("ec-role-wrap").classList.toggle("hidden", !hasRoles);
    var roleFilter = hasRoles ? $("ec-role").value : "";
    var rows = data.nations.slice();
    if (facFilter) rows = rows.filter(function (n) { return n.faction === facFilter; });
    if (roleFilter) rows = rows.filter(function (n) { return n.role === roleFilter; });
    var parts = [];
    if (facFilter || roleFilter) parts.push(rows.length + " of " + data.nations.length + " nations");
    else parts.push(data.nations.length + " nations");
    if (roleFilter) parts.push(roleFilter === "playable" ? "playable" : "AI");
    else if (hasRoles) parts.push(data.nations.filter(function (n) { return n.role === "playable"; }).length + " playable / " + data.nations.filter(function (n) { return n.role === "ai"; }).length + " AI");
    if (facFilter) parts.push(facFilter);
    parts.push(data.speed + " speed");
    $("ec-meta").textContent = parts.join(" · ") + " · daily production at game start";
    var k = econSort.key;
    rows.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return econSort.asc ? -1 : 1;
      if (av > bv) return econSort.asc ? 1 : -1;
      return 0;
    });
    function rowHtml(n) {
      var fclass = "f-" + (n.faction || "Neutral").replace(/[^A-Za-z0-9]/g, "");
      var roleBadge = n.role ? " <span class='role-tag role-" + n.role + "'>" + (n.role === "playable" ? "Playable" : "AI") + "</span>" : "";
      return "<tr>" +
        "<td class='item-name'>" + n.nation + roleBadge + "</td>" +
        "<td>" + (n.faction ? "<span class='faction-tag " + fclass + "'>" + n.faction + "</span>" : "—") + "</td>" +
        "<td class='num'>" + fmt(n.money) + "</td>" +
        "<td class='num'>" + fmt(n.manpower) + "</td>" +
        "<td class='num'>" + fmt(n.food) + "</td>" +
        "<td class='num'>" + fmt(n.metal) + "</td>" +
        "<td class='num'>" + fmt(n.oil) + "</td>" +
        "</tr>";
    }
    var hasRegions = rows.some(function (n) { return n.region; });
    if (hasRegions) {
      var byRegion = {};
      rows.forEach(function (n) { (byRegion[n.region] = byRegion[n.region] || []).push(n); });
      var order = REGION_ORDER.filter(function (r) { return byRegion[r]; });
      Object.keys(byRegion).forEach(function (r) { if (order.indexOf(r) < 0) order.push(r); });
      $("econ-body").innerHTML = order.map(function (r) {
        return "<tr class='region-row'><td colspan='7'>" + r + " <span class='region-count'>" + byRegion[r].length + "</span></td></tr>" +
          byRegion[r].map(rowHtml).join("");
      }).join("");
    } else {
      $("econ-body").innerHTML = rows.map(rowHtml).join("");
    }
    document.querySelectorAll(".econ-table th[data-sort]").forEach(function (th) {
      th.classList.toggle("sorted", th.dataset.sort === econSort.key);
      th.classList.toggle("asc", th.dataset.sort === econSort.key && econSort.asc);
    });
  }

  /* ================= WIRE UP ================= */
  fillFactionSelect();
  fillTypeSelect();
  fillAffordScenarios();
  fillEconScenarios();
  renderEcon();
  render();
  $("year").textContent = "2026";

  $("faction").addEventListener("change", function () { currentFaction = this.value; fillTypeSelect(); });
  $("add-kind").addEventListener("change", function () {
    // faction picker only matters for units
    document.querySelector(".faction-pick").style.opacity = this.value === "building" ? ".45" : "1";
    fillTypeSelect();
  });
  $("add-type").addEventListener("change", fillLevelSelect);
  $("add-btn").addEventListener("click", addItem);
  $("clear-btn").addEventListener("click", function () { items = []; render(); });
  $("items-body").addEventListener("click", function (e) {
    var b = e.target.closest(".row-del");
    if (b) removeItem(parseInt(b.dataset.i, 10));
  });
  $("af-scenario").addEventListener("change", fillAffordNations);
  $("af-nation").addEventListener("change", renderAfford);
  $("ec-scenario").addEventListener("change", renderEcon);
  $("ec-faction").addEventListener("change", renderEcon);
  $("ec-role").addEventListener("change", renderEcon);
  document.querySelectorAll(".econ-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.dataset.sort;
      if (econSort.key === k) econSort.asc = !econSort.asc;
      else { econSort.key = k; econSort.asc = (k === "nation" || k === "faction"); }
      renderEcon();
    });
  });
})();
