import Foundation

// Add the generated depth graph to the existing HEIF container. ImageIO cannot
// round-trip Apple's Styles items. Keep every original item/property/payload and
// replace only primary Exif/XMP with the depth writer's merged metadata.
enum PhotoDepthHEIF {
  struct Box {
    let type: String
    let payload: Data
    var encoded: Data { PhotoDepthHEIF.box(type, payload) }
  }
  struct Item {
    let id: Int
    let type: String
    let info: Data
    let payload: Data
  }
  struct Reference {
    let type: String
    let from: Int
    let to: [Int]
  }
  struct Graph {
    let top: [Box]
    let children: [Box]
    let primary: Int
    let items: [Item]
    let properties: [Box]
    let associations: [Int: [(Int, Bool)]]
    let references: [Reference]
  }
  struct Reader {
    let data: Data
    var offset = 0
    mutating func bytes(_ count: Int) throws -> Data {
      guard count >= 0, offset <= data.count, count <= data.count - offset else { throw PhotoDepthError.invalidImage }
      defer { offset += count }
      return Data(data[offset..<offset + count])
    }
    mutating func number(_ count: Int) throws -> Int {
      guard (0...8).contains(count) else { throw PhotoDepthError.invalidImage }
      var value: UInt64 = 0
      for byte in try bytes(count) { value = (value << 8) | UInt64(byte) }
      guard value <= UInt64(Int.max) else { throw PhotoDepthError.invalidImage }
      return Int(value)
    }
  }
  static func number(_ value: Int, _ count: Int) -> Data {
    Data((0..<count).reversed().map { UInt8(truncatingIfNeeded: UInt64(value) >> ($0 * 8)) })
  }
  static func box(_ type: String, _ payload: Data) -> Data {
    number(payload.count + 8, 4) + Data(type.utf8) + payload
  }
  static func boxes(_ data: Data) throws -> [Box] {
    var reader = Reader(data: data)
    var result: [Box] = []
    while reader.offset < data.count {
      let size = try reader.number(4)
      let type = String(decoding: try reader.bytes(4), as: UTF8.self)
      let length = size == 1 ? try reader.number(8) - 16 : size == 0 ? data.count - reader.offset : size - 8
      result.append(Box(type: type, payload: try reader.bytes(length)))
    }
    return result
  }
  static func parse(_ data: Data) throws -> Graph {
    let top = try boxes(data)
    guard let meta = top.first(where: { $0.type == "meta" }), meta.payload.count >= 4 else { throw PhotoDepthError.invalidImage }
    let children = try boxes(Data(meta.payload.dropFirst(4)))
    func required(_ name: String) throws -> Data {
      guard let value = children.first(where: { $0.type == name }) else { throw PhotoDepthError.invalidImage }
      return value.payload
    }
    var pitm = Reader(data: try required("pitm"))
    let pitmVersion = try pitm.number(1); _ = try pitm.bytes(3)
    let primary = try pitm.number(pitmVersion == 0 ? 2 : 4)
    var locations: [Int: Data] = [:]
    var iloc = Reader(data: try required("iloc"))
    let version = try iloc.number(1); _ = try iloc.bytes(3)
    guard version <= 2 else { throw PhotoDepthError.invalidImage }
    let sizes = try iloc.number(1), sizes2 = try iloc.number(1)
    let offsetSize = sizes >> 4, lengthSize = sizes & 15, baseSize = sizes2 >> 4, indexSize = version > 0 ? sizes2 & 15 : 0
    let count = try iloc.number(version < 2 ? 2 : 4)
    let idat = children.first(where: { $0.type == "idat" })?.payload ?? Data()
    for _ in 0..<count {
      let id = try iloc.number(version < 2 ? 2 : 4)
      let method = version > 0 ? try iloc.number(2) & 15 : 0
      guard try iloc.number(2) == 0, method <= 1 else { throw PhotoDepthError.invalidImage }
      let base = try iloc.number(baseSize), extents = try iloc.number(2)
      var payload = Data()
      for _ in 0..<extents {
        _ = try iloc.number(indexSize)
        let offset = try iloc.number(offsetSize), length = try iloc.number(lengthSize)
        guard base <= Int.max - offset else { throw PhotoDepthError.invalidImage }
        var source = Reader(data: method == 1 ? idat : data, offset: base + offset)
        payload += try source.bytes(length)
      }
      locations[id] = payload
    }
    var iinf = Reader(data: try required("iinf"))
    let infoVersion = try iinf.number(1); _ = try iinf.bytes(3)
    _ = try iinf.number(infoVersion == 0 ? 2 : 4)
    let entries = try boxes(try iinf.bytes(iinf.data.count - iinf.offset))
    var items: [Item] = []
    for entry in entries {
      var reader = Reader(data: entry.payload)
      let v = try reader.number(1); _ = try reader.bytes(3)
      guard entry.type == "infe", v == 2 || v == 3 else { throw PhotoDepthError.invalidImage }
      let id = try reader.number(v == 2 ? 2 : 4)
      guard try reader.number(2) == 0, let payload = locations[id] else { throw PhotoDepthError.invalidImage }
      let type = String(decoding: try reader.bytes(4), as: UTF8.self)
      items.append(Item(id: id, type: type, info: entry.payload, payload: payload))
    }
    let iprp = try boxes(try required("iprp"))
    guard let ipco = iprp.first(where: { $0.type == "ipco" }) else { throw PhotoDepthError.invalidImage }
    let properties = try boxes(ipco.payload)
    var associations: [Int: [(Int, Bool)]] = [:]
    for entry in iprp where entry.type == "ipma" {
      var reader = Reader(data: entry.payload)
      let v = try reader.number(1), flags = try reader.number(3), count = try reader.number(4)
      for _ in 0..<count {
        let id = try reader.number(v == 0 ? 2 : 4), count = try reader.number(1)
        let wide = flags & 1 != 0, mask = wide ? 0x7fff : 0x7f
        for _ in 0..<count {
          let value = try reader.number(wide ? 2 : 1), index = value & mask
          guard index <= properties.count else { throw PhotoDepthError.invalidImage }
          associations[id, default: []].append((index, value & (mask + 1) != 0))
        }
      }
    }
    var references: [Reference] = []
    if let iref = children.first(where: { $0.type == "iref" }) {
      var reader = Reader(data: iref.payload)
      let v = try reader.number(1); _ = try reader.bytes(3)
      guard v <= 1 else { throw PhotoDepthError.invalidImage }
      for entry in try boxes(try reader.bytes(reader.data.count - reader.offset)) {
        var r = Reader(data: entry.payload)
        let from = try r.number(v == 0 ? 2 : 4), count = try r.number(2)
        var to: [Int] = []
        for _ in 0..<count { to.append(try r.number(v == 0 ? 2 : 4)) }
        references.append(Reference(type: entry.type, from: from, to: to))
      }
    }
    return Graph(top: top, children: children, primary: primary, items: items, properties: properties, associations: associations, references: references)
  }

  static func hasStyles(_ url: URL) throws -> Bool {
    let data = try Data(contentsOf: url, options: .mappedIfSafe)
    guard data.count >= 12, String(decoding: data[4..<8], as: UTF8.self) == "ftyp" else { return false }
    let graph = try parse(data)
    return graph.items.contains { $0.info.range(of: Data("styleMetadata".utf8)) != nil }
      || graph.properties.contains { $0.payload.range(of: Data("styledeltamap".utf8)) != nil }
  }

  static func merge(original: URL, depth: URL) throws {
    let source = try parse(Data(contentsOf: original))
    let donor = try parse(Data(contentsOf: depth))
    let roots = donor.associations.compactMap { id, values -> Int? in
      values.contains { index, _ in
        guard index > 0 else { return false }
        let property = donor.properties[index - 1]
        let text = String(decoding: property.payload, as: UTF8.self).lowercased()
        return property.type == "auxC" && (text.contains("disparity") || text.contains("depth") || text.contains("urn:mpeg:hevc:2015:auxid:2\0"))
      } ? id : nil
    }
    guard !roots.isEmpty else { throw PhotoDepthError.invalidImage }
    var selected = Set(roots)
    // Include tiles and the depth description, but never donor main-image pixels.
    var changed = true
    while changed {
      let before = selected
      for ref in donor.references {
        if ref.type == "dimg", selected.contains(ref.from) { selected.formUnion(ref.to) }
        if ref.type == "cdsc", ref.to.contains(where: { selected.contains($0) }) { selected.insert(ref.from) }
      }
      changed = before != selected
    }
    func primaryMetadata(_ graph: Graph) -> Set<Int> {
      Set(graph.items.filter { item in
        (item.type == "Exif" || (item.type == "mime" && item.info.range(of: Data("application/rdf+xml".utf8)) != nil)) &&
          graph.references.contains { $0.type == "cdsc" && $0.from == item.id && $0.to.contains(graph.primary) }
      }.map(\.id))
    }
    selected.formUnion(primaryMetadata(donor))
    guard !selected.contains(donor.primary) else { throw PhotoDepthError.invalidImage }
    let replaced = primaryMetadata(source)
    var items = source.items.filter { !replaced.contains($0.id) }
    var mapping = [donor.primary: source.primary]
    if let donorToneMap = donor.items.first(where: { $0.type == "tmap" }),
       let sourceToneMap = source.items.first(where: { $0.type == "tmap" }) {
      mapping[donorToneMap.id] = sourceToneMap.id
    }
    var next = (source.items.map(\.id).max() ?? 0) + 1
    for item in donor.items where selected.contains(item.id) { mapping[item.id] = next; next += 1 }
    guard next <= Int(UInt16.max), source.properties.count + donor.properties.count < 0x8000 else { throw PhotoDepthError.invalidImage }
    for item in donor.items where selected.contains(item.id) {
      let width = item.info[0] == 2 ? 2 : 4
      // Keep 16-bit item IDs for ImageIO interoperability.
      let info = Data([2]) + item.info[1..<4] + number(mapping[item.id]!, 2) + item.info.dropFirst(4 + width)
      items.append(Item(id: mapping[item.id]!, type: item.type, info: info, payload: item.payload))
    }
    var references = source.references.filter { !replaced.contains($0.from) && !$0.to.contains(where: { replaced.contains($0) }) }
    for ref in donor.references where selected.contains(ref.from) {
      guard ref.to.allSatisfy({ mapping[$0] != nil }) else { throw PhotoDepthError.invalidImage }
      references.append(Reference(type: ref.type, from: mapping[ref.from]!, to: ref.to.map { mapping[$0]! }))
    }
    var associations = source.associations.filter { !replaced.contains($0.key) }
    for id in selected {
      associations[mapping[id]!] = (donor.associations[id] ?? []).map { ($0.0 == 0 ? 0 : $0.0 + source.properties.count, $0.1) }
    }
    let properties = source.properties + donor.properties
    let iinf = box("iinf", Data([0, 0, 0, 0]) + number(items.count, 2) + items.reduce(Data()) { $0 + box("infe", $1.info) })
    let iref = box("iref", Data([0, 0, 0, 0]) + references.reduce(Data()) { data, ref in
      data + box(ref.type, number(ref.from, 2) + number(ref.to.count, 2) + ref.to.reduce(Data()) { $0 + number($1, 2) })
    })
    var ipma = Data([0, 0, 0, 1]) + number(associations.count, 4)
    for id in associations.keys.sorted() {
      let values = associations[id]!
      guard values.count <= 255 else { throw PhotoDepthError.invalidImage }
      ipma += number(id, 2) + number(values.count, 1)
      for (index, essential) in values { ipma += number(index | (essential ? 0x8000 : 0), 2) }
    }
    let iprp = box("iprp", box("ipco", properties.reduce(Data()) { $0 + $1.encoded }) + box("ipma", ipma))
    func meta(_ start: Int) -> Data {
      var offset = start
      var iloc = Data([1, 0, 0, 0, 0x88, 0]) + number(items.count, 2)
      for item in items {
        iloc += number(item.id, 2) + number(0, 2) + number(0, 2) + number(1, 2) + number(offset, 8) + number(item.payload.count, 8)
        offset += item.payload.count
      }
      var payload = Data(repeating: 0, count: 4)
      for child in source.children {
        switch child.type {
        case "iloc": payload += box("iloc", iloc)
        case "iinf": payload += iinf
        case "iref": payload += iref
        case "iprp": payload += iprp
        case "idat": break
        default: payload += child.encoded
        }
      }
      if !source.children.contains(where: { $0.type == "iref" }) { payload += iref }
      return box("meta", payload)
    }
    // Item offsets are rebuilt, while all original image payloads stay intact.
    var result = source.top.filter { $0.type != "meta" && $0.type != "mdat" }.reduce(Data()) { $0 + $1.encoded }
    let newMeta = meta(result.count + meta(0).count + 8)
    result += newMeta
    result += box("mdat", items.reduce(Data()) { $0 + $1.payload })
    let verified = try parse(result)
    for item in source.items where !replaced.contains(item.id) {
      guard verified.items.contains(where: { $0.id == item.id && $0.payload == item.payload && $0.info == item.info }) else { throw PhotoDepthError.invalidImage }
    }
    try result.write(to: depth, options: .atomic)
  }
}
