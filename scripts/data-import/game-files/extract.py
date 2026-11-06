# Trích bảng dữ liệu từ game đã cài trên máy chủ project (chỉ đọc, không sửa file game, không giải mã).
# Kết quả ở scripts/data-import/game-files/dump/ (bị git bỏ qua: không commit dữ liệu gốc của game); các
# script <nguồn>-fetch.mjs đọc từ đó. Luật ở content-sources-real.md mục "Đọc dữ liệu từ game đã cài".
# Cài: python -m venv venv && venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI dnfile
# Chạy: venv/Scripts/python scripts/data-import/game-files/extract.py [thư mục steamapps/common]
import json
import os
import re
import sqlite3
import struct
import sys

import dnfile
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

COMMON = sys.argv[1] if len(sys.argv) > 1 else "G:/SteamLibrary/steamapps/common"
DUMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dump")


def save_text_assets(root, out_name, pattern):
    """Lưu các TextAsset khớp tên trong một thư mục Unity (mỗi file nạp riêng cho nhẹ)."""
    out_dir = os.path.join(DUMP, out_name)
    os.makedirs(out_dir, exist_ok=True)
    wanted = re.compile(pattern)
    saved = 0
    for folder, _, files in os.walk(root):
        for file_name in files:
            if not (file_name.endswith((".bundle", ".assets")) or re.fullmatch(r"level\d+", file_name)):
                continue
            for obj in UnityPy.load(os.path.join(folder, file_name)).objects:
                if obj.type.name != "TextAsset":
                    continue
                value = obj.read()
                if not wanted.fullmatch(value.m_Name or ""):
                    continue
                raw = value.m_Script
                body = raw.encode("utf-8", "surrogateescape") if isinstance(raw, str) else bytes(raw)
                with open(os.path.join(out_dir, f"{value.m_Name}.txt"), "wb") as f:
                    f.write(body)
                saved += 1
    print(out_name, "saved", saved)


def extract_faeterra():
    """Mỗi chuỗi Fae: tên, huyền thoại, hệ (ScriptableObject hệ mà prefab trong trận tham chiếu tới)."""
    data_dir = f"{COMMON}/FaeTerra/FaeTerra_Data"
    env = UnityPy.load(data_dir)
    generator = TypeTreeGenerator(next(iter(env.objects)).assets_file.unity_version)
    generator.load_local_game(f"{data_dir}/..")
    env.typetree_generator = generator
    files, elements, trees = {}, {}, []
    for obj in env.objects:
        files.setdefault(obj.assets_file.name, {})[obj.path_id] = obj
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:  # MonoBehaviour không giải được kiểu thì không phải bảng cần tìm
            continue
        if "_creatureElements" in tree and tree.get("m_Name"):
            elements[(obj.assets_file.name, obj.path_id)] = tree["m_Name"]
        if "CreatureInfo" in tree and "BattleCreature" in tree:
            trees.append((obj.assets_file.name, tree))
    chains = []
    for file_name, tree in trees:
        objects = files[file_name]
        found = set()
        for entry in objects[tree["BattleCreature"]["m_PathID"]].read_typetree().get("m_Component", []):
            component = objects.get(entry["component"]["m_PathID"])
            if component is None or component.type.name != "MonoBehaviour":
                continue
            try:
                text = json.dumps(component.read_typetree(), default=str)
            except Exception:
                continue
            for (owner, path_id), name in elements.items():
                if owner == file_name and f'"m_PathID": {path_id}' in text:
                    found.add(name)
        chains.append(
            {
                "elements": sorted(found),
                "forms": [
                    {"id": c["Id"], "name": c["Name"], "legendary": bool(c["IsLegendary"])}
                    for c in tree["CreatureInfo"]
                ],
            }
        )
    chains.sort(key=lambda chain: chain["forms"][0]["id"])
    with open(os.path.join(DUMP, "faeterra.json"), "w", encoding="utf-8") as f:
        json.dump(chains, f, ensure_ascii=False, indent=1)
    print("faeterra chains", len(chains))


def extract_godot_jsons(exe, out_name, pattern):
    """Đọc mục lục PCK Godot 4 nhúng trong exe (không mã hóa), lưu file dữ liệu khớp đường dẫn."""
    out_dir = os.path.join(DUMP, out_name)
    os.makedirs(out_dir, exist_ok=True)
    wanted = re.compile(pattern)
    with open(exe, "rb") as f:
        f.seek(-12, os.SEEK_END)
        pck_size, magic = struct.unpack("<q4s", f.read(12))
        if magic != b"GDPC":
            raise SystemExit("không thấy PCK cuối exe")
        f.seek(-12 - pck_size, os.SEEK_END)
        f.read(4)
        f.read(16)
        flags, file_base = struct.unpack("<IQ", f.read(12))
        if flags & 1:
            raise SystemExit("thư mục PCK bị mã hóa: dừng, không giải mã")
        f.seek(16 * 4, os.SEEK_CUR)
        entries = []
        for _ in range(struct.unpack("<I", f.read(4))[0]):
            length = struct.unpack("<I", f.read(4))[0]
            path = f.read(length).rstrip(b"\0").decode("utf-8", "replace")
            offset, size = struct.unpack("<QQ", f.read(16))
            f.read(16)
            entries.append((path, offset, size, struct.unpack("<I", f.read(4))[0]))
        for path, offset, size, file_flags in entries:
            if wanted.search(path) and not file_flags & 1:
                f.seek(file_base + offset)
                with open(os.path.join(out_dir, os.path.basename(path)), "wb") as out:
                    out.write(f.read(size))
    print(out_name, "ok")


def extract_beastmancer():
    """BeastData là database SQLite: cộng dồn chỉ số tăng theo level của từng quái."""
    data_dir = "D:/SteamLibrary/steamapps/common/Beastmancer/Beastmancer_Data"
    save_text_assets(data_dir, "beastmancer", r"BeastData")
    db = sqlite3.connect(os.path.join(DUMP, "beastmancer", "BeastData.txt"))
    rows = db.execute(
        "select monster_name, sum(health), sum(attack), sum(defense), sum(initiative), sum(speed)"
        " from stats group by monster_name"
    ).fetchall()
    db.close()
    keys = ("name", "health", "attack", "defense", "initiative", "speed")
    with open(os.path.join(DUMP, "beastmancer.json"), "w", encoding="utf-8") as f:
        json.dump([dict(zip(keys, row)) for row in rows], f, indent=1)
    print("beastmancer", len(rows))
    env = UnityPy.load(os.path.join(data_dir, "resources.assets"))
    objects = list(env.objects)
    generator = TypeTreeGenerator(objects[0].assets_file.unity_version)
    generator.load_local_game(f"{data_dir}/..")
    env.typetree_generator = generator
    by_id = {obj.path_id: obj for obj in objects}
    names = {row[0] for row in rows}
    prefabs = {}
    for obj in objects:
        if obj.type.name != "GameObject":
            continue
        tree = obj.read_typetree()
        if tree.get("m_Name") not in names:
            continue
        for entry in tree.get("m_Component", []):
            component = by_id.get(entry["component"]["m_PathID"])
            if component is None or component.type.name != "MonoBehaviour":
                continue
            try:
                value = component.read_typetree()
            except Exception:  # component không giải được kiểu thì không phải component quái
                continue
            if "currentFaction" in value:
                fields = ("health", "attack", "defense", "initiative", "speed", "big", "flies")
                prefabs[tree["m_Name"]] = {key: value[key] for key in fields}
    with open(os.path.join(DUMP, "beastmancer-prefabs.json"), "w", encoding="utf-8") as f:
        json.dump(prefabs, f, indent=1)
    print("beastmancer prefabs", len(prefabs))


def extract_asar_json(asar, out_name, marker):
    """Bảng JSON.parse('[...]') trong bundle JS của app Electron (mục lục asar đọc thẳng, không mã hóa)."""
    with open(asar, "rb") as f:
        f.read(4)
        header_size = struct.unpack("<I", f.read(4))[0]
        f.read(4)
        length = struct.unpack("<I", f.read(4))[0]
        files = json.loads(f.read(length))["files"]
        js = files["build"]["files"]["static"]["files"]["js"]["files"]
        name = next(n for n in js if re.fullmatch(r"main\.\w+\.js", n))
        f.seek(8 + header_size + int(js[name]["offset"]))
        text = f.read(js[name]["size"]).decode("utf-8")
    start = text.index(marker)
    end = text.index("]')", start) + 1
    with open(os.path.join(DUMP, out_name), "w", encoding="utf-8") as f:
        f.write(text[start:end].replace("\\'", "'"))
    print(out_name, "ok")


def enums_of(dll):
    """Enum của một DLL .NET: tên enum → giá trị → tên hằng."""
    md = dnfile.dnPE(dll).net.mdtables
    constants = {}
    for row in md.Constant.rows:
        if row.Parent.table.name == "Field":
            constants[row.Parent.row_index] = row.Value.value if hasattr(row.Value, "value") else row.Value
    result = {}
    for type_row in md.TypeDef.rows:
        names = {}
        for field_ref in type_row.FieldList or []:
            raw = constants.get(field_ref.row_index)
            if isinstance(raw, (bytes, bytearray)) and len(raw) <= 8:
                names[int.from_bytes(raw, "little", signed=True)] = str(md.Field.rows[field_ref.row_index - 1].Name)
        extends = type_row.Extends.row if type_row.Extends else None
        if names and str(getattr(extends, "TypeName", "")) == "Enum":
            result[str(type_row.TypeName)] = names
    return result


def i2_terms(raw):
    """Bảng ngôn ngữ I2 thô: term → chuỗi ngôn ngữ đầu (tiếng Anh)."""
    terms = {}
    pattern = re.compile(rb"^[A-Za-z_]+/[\w/ .-]+$")
    for p in range(0, len(raw) - 8, 4):
        length = int.from_bytes(raw[p:p + 4], "little", signed=True)
        if not 3 <= length <= 80 or p + 4 + length > len(raw):
            continue
        term = raw[p + 4:p + 4 + length]
        if not pattern.match(term):
            continue
        q = (p + 4 + length + 3) & ~3
        kind = int.from_bytes(raw[q:q + 4], "little", signed=True)
        count = int.from_bytes(raw[q + 4:q + 8], "little", signed=True)
        text_length = int.from_bytes(raw[q + 8:q + 12], "little", signed=True)
        if 0 <= kind <= 12 and count == 2 and 0 <= text_length <= 2000:
            terms[term.decode()] = raw[q + 12:q + 12 + text_length].decode("utf-8", "replace")
    return terms


def extract_wilderlocke():
    """Bản demo: chiêu (cắt trường references không giải được, không cần), loài, rune, enum, ngôn ngữ."""
    data_dir = f"{COMMON}/WILDERLOCKE Demo/WILDERLOCKE_Data"
    out_dir = os.path.join(DUMP, "wilderlocke")
    os.makedirs(out_dir, exist_ok=True)
    names = [n for n in os.listdir(data_dir) if re.fullmatch(r"sharedassets\d+\.assets|resources\.assets", n)]
    generator = None
    moves, species, runes, challengers = [], [], [], []
    terms = {}
    file_of = {}
    for name in names:
        env = UnityPy.load(os.path.join(data_dir, name))
        objects = list(env.objects)
        if not objects:
            continue
        if generator is None:
            generator = TypeTreeGenerator(objects[0].assets_file.unity_version)
            generator.load_local_game(f"{data_dir}/..")
        env.typetree_generator = generator
        file_of[name] = objects[0].assets_file
        for obj in objects:
            if obj.type.name != "MonoBehaviour":
                continue
            raw = obj.get_raw_data()
            if b"move/6/name" in raw:
                terms = i2_terms(raw)
            try:
                node = obj._get_typetree_node()
            except Exception:  # không giải được kiểu: không phải bảng cần tìm
                continue
            children = [child.m_Name for child in node.m_Children]
            if "isSwitchgMove" in children:
                node.m_Children = [c for c in node.m_Children if c.m_Name != "references"]
                tree = obj.read_typetree(nodes=node, check_read=False)
                for key in ("m_GameObject", "m_Script", "m_Enabled", "animations", "audioClips", "aIModifiers"):
                    tree.pop(key, None)
                moves.append({**tree, "__file": name, "__path": obj.path_id})
            elif "learnableMoves" in children:
                species.append({**obj.read_typetree(), "__file": name, "__path": obj.path_id})
            elif "challengerMonsterList" in children:
                challengers.append({**obj.read_typetree(), "__file": name})
            elif "move" in children and "ItemType" in children:
                tree = obj.read_typetree()
                runes.append({"path": obj.path_id, "file": name, "move": tree["move"]})
    move_by_ref = {(m["__file"], m["__path"]): m["id"] for m in moves}
    rune_by_ref = {(r["file"], r["path"]): r["move"] for r in runes}

    def external_name(owner, file_id):
        """Tên file của tham chiếu PPtr: 0 = cùng file, n = externals[n - 1]."""
        if file_id == 0:
            return owner
        return os.path.basename(file_of[owner].externals[file_id - 1].path)

    def move_id(owner, ref):
        target = external_name(owner, ref["m_FileID"])
        found = move_by_ref.get((target, ref["m_PathID"]))
        if found is not None:
            return found
        rune = rune_by_ref.get((target, ref["m_PathID"]))
        return move_by_ref.get((external_name(target, rune["m_FileID"]), rune["m_PathID"])) if rune else None

    unresolved = 0
    species_number = {(row["__file"], row["__path"]): row["id"] for row in species}
    teams = []
    for row in challengers:
        owner = row["__file"]
        teams.append(
            {
                "id": row["id"],
                "challengerType": row["challengerType"],
                "challengerClass": row["challengerClass"],
                "monsters": [
                    {
                        "speciesNumber": species_number.get(
                            (external_name(owner, m["monsterBase"]["m_FileID"]), m["monsterBase"]["m_PathID"])
                        ),
                        "level": m["monsterLvl"],
                        "moves": [move_id(owner, ref) for ref in m["Moves"]],
                    }
                    for m in row["challengerMonsterList"]
                ],
            }
        )
    for row in species:
        owner = row["__file"]
        row["resolvedMoves"] = []
        for entry in row["learnableMoves"]:
            found = move_id(owner, entry["moveBase"])
            unresolved += found is None
            if found is not None:
                row["resolvedMoves"].append({"moveId": found, "level": entry["level"]})
        row["resolvedRunes"] = []
        for ref in row["learnableByRunes"]:
            found = move_id(owner, ref)
            unresolved += found is None
            if found is not None:
                row["resolvedRunes"].append(found)
        for key in ("m_GameObject", "m_Script", "m_Enabled", "frontSprite", "backSprite", "large_portrait", "small_portrait", "learnableMoves", "learnableByRunes"):
            row.pop(key, None)
    for file_name, value in (("moves", moves), ("species", species), ("challengers", teams), ("terms", terms), ("enums", enums_of(f"{data_dir}/Managed/Assembly-CSharp.dll"))):
        with open(os.path.join(out_dir, f"{file_name}.json"), "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, default=str)
    print("wilderlocke moves", len(moves), "species", len(species), "runes", len(runes), "terms", len(terms), "unresolved", unresolved)


class BinaryReader:
    """Đọc dữ liệu tuần tự kiểu Unity (số nhỏ đầu, căn 4 byte sau bool / chuỗi)."""

    def __init__(self, raw):
        self.raw, self.pos = raw, 0

    def align(self):
        self.pos = (self.pos + 3) & ~3

    def int32(self):
        value = struct.unpack_from("<i", self.raw, self.pos)[0]
        self.pos += 4
        return value

    def float32(self):
        value = struct.unpack_from("<f", self.raw, self.pos)[0]
        self.pos += 4
        return value

    def flag(self):
        value = self.raw[self.pos]
        self.pos += 1
        self.align()
        return value

    def pointer(self):
        file_id = self.int32()
        path_id = struct.unpack_from("<q", self.raw, self.pos)[0]
        self.pos += 8
        return file_id, path_id

    def string(self):
        length = self.int32()
        value = self.raw[self.pos:self.pos + length].decode("utf-8", "replace")
        self.pos += length
        self.align()
        return value

    def array(self, read_item):
        count = self.int32()
        if not 0 <= count <= 10000:
            raise ValueError(f"độ dài mảng lạ {count}")
        return [read_item() for _ in range(count)]


PHEREON_STATS = ["hp", "hpRegen", "mana", "manaRegen", "magicStrength", "strength", "armor"]
# Chỉ số dục vọng / sinh sản của gốc không dùng (nội dung người lớn, content-sources-real.md).
PHEREON_SKIPPED_STATS = 5


def read_phereon_character(raw):
    """CharacterData của Portals of Phereon (typetree tự sinh đọc sai string[], nên đọc tay theo khai báo)."""
    r = BinaryReader(raw)
    r.pointer()
    r.flag()
    r.pointer()
    row = {"name": r.string()}
    for key in ["species", "eggType", "damageType", "attackType", "lvType"]:
        row[key] = r.int32()
    row["growth"] = {k: round(r.float32(), 3) for k in ["hp", "mana", "strength", "magic", "lust", "speed"]}
    del row["growth"]["lust"]
    for key in ["movementType", "movementAction", "speed", "size"]:
        row[key] = r.int32()
    for _ in range(18):  # đặc điểm cơ thể: không dùng
        r.int32()
    for _ in range(5):
        r.flag()
    for _ in range(3):
        r.int32()
    picture = lambda: (r.int32(), r.pointer())  # noqa: E731
    for _ in range(3):
        r.array(picture)
    r.array(lambda: (r.pointer(), r.pointer(), r.pointer()))
    for _ in range(3):
        r.array(picture)
    for _ in range(2):
        r.array(lambda: (r.string(), r.pointer()))
    r.array(r.int32)
    r.array(r.int32)
    row["isBreedable"], row["isHumanoid"], row["isToken"] = r.flag(), r.flag(), r.flag()
    for key in PHEREON_STATS:
        row[key] = r.int32()
    for _ in range(PHEREON_SKIPPED_STATS):
        r.int32()
    row["guaranteedSkills"] = r.array(r.string)
    row["optionalSkills"] = r.array(r.string)
    row["specialTraits"] = r.array(r.int32)
    row["passives"] = r.array(lambda: (r.int32(), r.string()))
    r.array(r.int32)
    r.pointer()
    if r.pos != len(raw):
        raise ValueError("thừa byte")
    return row


def extract_phereon():
    """Portals of Phereon (cài ngoài Steam, thư mục PHEREON_DIR): CharacterData mọi loài + tên enum."""
    root = os.environ.get("PHEREON_DIR", "D:/210/PoP")
    env = UnityPy.load(f"{root}/PortalsOfPhereon_Data/data.unity3d")
    enums = enums_of(f"{root}/PortalsOfPhereon_Data/Managed/Assembly-CSharp.dll")
    rows = {}
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            row = read_phereon_character(obj.get_raw_data())
        except (ValueError, struct.error, IndexError):
            continue  # MonoBehaviour khác kiểu
        if row["name"] and row["hp"] > 0:
            row["species"] = enums["Species"].get(row["species"], str(row["species"]))
            row["specialTraits"] = [enums["SpecialTraits"].get(t, str(t)) for t in row["specialTraits"]]
            # Kiểu kích hoạt passive (enum lồng Passives.Type) giữ số, phereon-fetch.mjs đổi tên.
            rows.setdefault(row["species"], row)
    out = {"characters": list(rows.values()), "enums": {k: enums[k] for k in ["EggType", "DamageType", "Size", "MovementType"]}}
    with open(os.path.join(DUMP, "phereon.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print("phereon", len(rows))


TASKS = {
    "phereon": extract_phereon,
    "wilderlocke": extract_wilderlocke,
    "biokept": lambda: save_text_assets(
        f"{COMMON}/BioKept/LootBox_Data", "biokept", r"BoxMonsterTable|BosMonsterTable"
    ),
    "dinotica": lambda: save_text_assets(
        f"{COMMON}/Dino Topia/Dinotica_Data/StreamingAssets/aa",
        "dinotica",
        r"Pet_Config|MonsterConfig|English|AttributePack",
    ),
    "faeterra": extract_faeterra,
    "fantasy-idle-dungeon": lambda: extract_godot_jsons(
        f"{COMMON}/Fantasy Idle Dungeon/Fantasy Idle Dungeon.exe",
        "fantasy-idle-dungeon",
        r"jsons/(RoleJson|LanguageJson)\.json$",
    ),
    "beastmancer": extract_beastmancer,
    "koltera": lambda: extract_asar_json(
        f"{COMMON}/Fableverse/resources/app.asar", "koltera.json", '[{"Name":"Otto"'
    ),
}
os.makedirs(DUMP, exist_ok=True)
# Đối số sau thư mục Steam: chỉ chạy các game này; không ghi thì chạy hết.
for task in sys.argv[2:] or TASKS:
    TASKS[task]()
