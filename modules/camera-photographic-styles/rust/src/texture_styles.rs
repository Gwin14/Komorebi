//! Experimental Texture Styles metadata inferred from sample HEIF files.
//! This supplements the existing 2023 Styles graph. Structural validity does
//! not guarantee that Photos exposes texture/grain controls on every device.

use crate::isobmff;
use crate::styles_bplist::BplistWriter;

pub const TEXTURE_STYLES_URI: &str = "tag:apple.com,2026:photo:metadata:texture_styles";

/// Build the Standard textureInfo bplist payload.
pub fn texture_info_payload(grain_seed: u64) -> Vec<u8> {
    let mut w = BplistWriter::new();
    let k_preset = w.add_str("Preset");
    let v_preset = w.add_str("Standard");
    let k_ctype = w.add_str("CaptureType");
    let v_ctype = w.add_str("LF");
    let k_cmode = w.add_str("CaptureMode");
    let v_cmode = w.add_str("Still");
    let k_ptype = w.add_str("PortType");
    let v_ptype = w.add_str("PortTypeBack");
    let k_hw = w.add_str("HardwareModel");
    let v_hw = w.add_str("iPhone19,2");
    let k_pdv = w.add_str("TextureStylePeopleDataVersion");
    let v_pdv = w.add_int(3);
    let k_gs = w.add_str("FilmGrainSeed");
    let v_gs = w.add_int(grain_seed);
    let top = w.add_dict(&[
        (k_preset, v_preset),
        (k_ctype, v_ctype),
        (k_cmode, v_cmode),
        (k_ptype, v_ptype),
        (k_hw, v_hw),
        (k_pdv, v_pdv),
        (k_gs, v_gs),
    ]);
    w.finish(top)
}

fn make_box(btype: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + payload.len());
    out.extend_from_slice(&((8 + payload.len()) as u32).to_be_bytes());
    out.extend_from_slice(btype);
    out.extend_from_slice(payload);
    out
}

/// Find an item's `ispe` dimensions via ipma association.
fn item_ispe(meta: &isobmff::ParsedMeta, item_id: u32) -> Option<(u32, u32)> {
    let assoc = meta.ipma_entries.iter().find(|e| e.item_id == item_id)?;
    assoc.associations.iter().find_map(|(index, _)| {
        meta.props
            .iter()
            .find(|p| p.index == *index && p.ptype == "ispe")
            .and_then(|p| isobmff::ispe_dimensions(&p.raw).ok())
    })
}

fn make_uri_metadata_infe(item_id: u32, uri: &str) -> Vec<u8> {
    // version=2, flags=1, item_id(u16), protection_index(u16), item_type="uri ",
    // item_name="metadata\0", content_type=<uri>\0
    let mut payload = vec![2u8, 0, 0, 1];
    payload.extend_from_slice(&(item_id as u16).to_be_bytes());
    payload.extend_from_slice(&0u16.to_be_bytes());
    payload.extend_from_slice(b"uri ");
    payload.extend_from_slice(b"metadata\0");
    payload.extend_from_slice(uri.as_bytes());
    payload.push(0);
    make_box(b"infe", &payload)
}

/// Inject a `uri metadata` item with the given URI and payload into `data`.
pub fn inject_uri_metadata_item(data: &[u8], uri: &str, payload: &[u8]) -> Result<Vec<u8>, String> {
    let top = isobmff::parse_boxes(data, 0, data.len());
    let meta_box = top
        .iter()
        .find(|b| b.btype == *b"meta")
        .ok_or("meta box not found")?;
    let content_start = meta_box.data_start + 4; // meta FullBox: + version/flags
    let content_end = meta_box.box_start + meta_box.size as usize;
    let children = isobmff::parse_boxes(data, content_start, content_end);

    let iinf = children
        .iter()
        .find(|b| b.btype == *b"iinf")
        .ok_or("iinf not found")?;
    let iloc = children
        .iter()
        .find(|b| b.btype == *b"iloc")
        .ok_or("iloc not found")?;
    let iref = children.iter().find(|b| b.btype == *b"iref");
    let pitm = children
        .iter()
        .find(|b| b.btype == *b"pitm")
        .ok_or("pitm not found")?;

    // The texture_styles cdsc content-describes the MAIN IMAGE (a grid item).
    // Our own outputs can carry primary_id=0, so resolve the largest-ispe grid
    // item instead, falling back to pitm primary_id when it names a real item.
    let parsed = isobmff::parse_source_meta(data)?;
    let pitm_id = isobmff::parse_pitm(data, pitm);
    let id_exists = |id: u32| parsed.items.iter().any(|i| i.item_id == id);
    let main_image_id = if pitm_id != 0 && id_exists(pitm_id) {
        pitm_id
    } else {
        parsed
            .items
            .iter()
            .filter(|i| i.itype.starts_with("grid"))
            .max_by_key(|i| {
                let (w, h) = item_ispe(&parsed, i.item_id).unwrap_or((0, 0));
                (w as u64) * (h as u64)
            })
            .map(|i| i.item_id)
            .unwrap_or(pitm_id)
    };
    let primary_id = main_image_id;
    if primary_id == 0 || !id_exists(primary_id) {
        return Err("primary image item not found".into());
    }
    // Repeated conversion must not create ambiguous duplicate URI items.
    if parsed.items.iter().any(|i| {
        i.raw_infe
            .windows(uri.len() + 1)
            .any(|w| w[..uri.len()] == *uri.as_bytes() && w[uri.len()] == 0)
    }) {
        return Err("URI metadata item already exists".into());
    }

    // Parse iinf entries (keep full boxes for re-emit) and find next free id.
    let iinf_items = isobmff::parse_iinf(data, iinf)?;
    let next_id = iinf_items
        .iter()
        .map(|i| i.item_id)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    if next_id > u16::MAX as u32 || iinf_items.len() >= u16::MAX as usize {
        return Err("metadata item IDs exceed supported 16-bit range".into());
    }
    let iinf_version = data[iinf.data_start];
    let entry_count_pos = iinf.data_start + 4;
    let count_size = if iinf_version == 0 { 2 } else { 4 };

    let new_infe = make_uri_metadata_infe(next_id, uri);

    // Rebuild iinf body: version/flags + (count+1) + existing infe boxes + new infe.
    let mut new_iinf_body = data[iinf.data_start..iinf.data_start + 4].to_vec();
    let entry_count_end = entry_count_pos + count_size;
    new_iinf_body.extend_from_slice(&(iinf_items.len() as u64 + 1).to_be_bytes()[8 - count_size..]);
    new_iinf_body.extend_from_slice(&data[entry_count_end..(iinf.box_start + iinf.size)]);
    new_iinf_body.extend_from_slice(&new_infe);
    let new_iinf = make_box(b"iinf", &new_iinf_body);
    let d_iinf = new_iinf.len() as i64 - iinf.size as i64;

    // Rebuild iref: append cdsc entry. Native Apple captures reference the
    // primary grid AND the tmap item (texture_styles applies to the composed
    // grid + its tile map), so mirror that contract when a tmap exists.
    let tmap_id = parsed
        .items
        .iter()
        .find(|i| i.itype.starts_with("tmap"))
        .map(|i| i.item_id);
    let mut to_ids: Vec<u32> = vec![primary_id];
    if let Some(tid) = tmap_id {
        if tid != primary_id {
            to_ids.push(tid);
        }
    }
    let new_iref = if let Some(iref_box) = iref {
        let mut body = data[iref_box.data_start..(iref_box.box_start + iref_box.size)].to_vec();
        let id_size_4 = body[0] >= 1;
        let write_id = |v: u32| {
            if id_size_4 {
                v.to_be_bytes().to_vec()
            } else {
                (v as u16).to_be_bytes().to_vec()
            }
        };
        let mut cdsc = Vec::new();
        let mut cdsc_payload = Vec::new();
        cdsc_payload.extend_from_slice(&write_id(next_id));
        cdsc_payload.extend_from_slice(&(to_ids.len() as u16).to_be_bytes());
        for id in &to_ids {
            cdsc_payload.extend_from_slice(&write_id(*id));
        }
        cdsc.extend_from_slice(&((8 + cdsc_payload.len()) as u32).to_be_bytes());
        cdsc.extend_from_slice(b"cdsc");
        cdsc.extend_from_slice(&cdsc_payload);
        body.extend_from_slice(&cdsc);
        let b = make_box(b"iref", &body);
        b
    } else {
        let mut body = vec![0, 0, 0, 0];
        body.extend_from_slice(&isobmff::make_iref_entry("cdsc", next_id, &to_ids, false));
        make_box(b"iref", &body)
    };

    let d_iref = new_iref.len() as i64 - iref.map(|b| b.size).unwrap_or(0) as i64;

    // Rebuild iloc: bump construction=0 extents by delta; append new entry.
    // The payload is placed INSIDE mdat (native Apple captures keep the
    // texture_styles item data within mdat; a trailing extent after mdat is
    // rejected by Photos and leaves the style editor "unavailable").
    let mdat = top
        .iter()
        .find(|b| b.btype == *b"mdat")
        .ok_or("mdat box not found")?;
    let mdat_end = mdat.box_start + mdat.size;
    let iloc_entries = isobmff::parse_iloc(data, iloc)?;
    // Two-pass: the iloc growth (4-byte base fields on every entry + the new
    // entry) must be known before the new entry's payload offset can be
    // computed. Sizes are identical across passes, so pass 1 measures.
    let payload_len = payload.len() as i64;
    let build_entries = |delta_total: i64, payload_abs: u64| -> Vec<isobmff::IlocEntry> {
        let mut v: Vec<isobmff::IlocEntry> = Vec::with_capacity(iloc_entries.len() + 1);
        for mut e in iloc_entries.clone() {
            for ext in e.extents.iter_mut() {
                if (e.construction_method & 0xF) == 0 {
                    let shift = if ext.0 >= content_end as u64 {
                        delta_total
                    } else {
                        0
                    } + if ext.0 >= mdat_end as u64 {
                        payload_len
                    } else {
                        0
                    };
                    ext.0 = (ext.0 as i64 + shift) as u64;
                }
            }
            v.push(e);
        }
        v.push(isobmff::IlocEntry {
            item_id: next_id,
            construction_method: 0,
            data_reference_index: 0,
            extents: vec![(payload_abs, payload.len() as u64)],
        });
        v
    };
    let probe = isobmff::make_iloc_box(&build_entries(d_iinf + d_iref, 0));
    let d_iloc = probe.len() as i64 - iloc.size as i64;
    let delta_total = d_iinf + d_iref + d_iloc;
    let payload_abs = (mdat_end as i64
        + if content_end <= mdat.box_start {
            delta_total
        } else {
            0
        }) as u64;
    let new_iloc = isobmff::make_iloc_box(&build_entries(delta_total, payload_abs));

    if new_iloc.len() != probe.len()
        || build_entries(delta_total, payload_abs)
            .iter()
            .flat_map(|e| &e.extents)
            .any(|&(off, len)| off > u32::MAX as u64 || len > u32::MAX as u64)
    {
        return Err("metadata extents exceed supported 32-bit range".into());
    }

    // Rebuild meta with the new children.
    let mut new_meta_body = data[meta_box.data_start..content_start].to_vec();
    for child in &children {
        if child.btype == *b"iinf" {
            new_meta_body.extend_from_slice(&new_iinf);
        } else if child.btype == *b"iloc" {
            new_meta_body.extend_from_slice(&new_iloc);
        } else if child.btype == *b"iref" {
            new_meta_body.extend_from_slice(&new_iref);
        } else {
            new_meta_body.extend_from_slice(&data[child.box_start..(child.box_start + child.size)]);
        }
    }
    if iref.is_none() {
        new_meta_body.extend_from_slice(&new_iref);
    }
    let new_meta = make_box(b"meta", &new_meta_body);

    // Patch the mdat size so the payload lands inside it.
    let mut mdat_bytes = data[mdat.box_start..mdat_end].to_vec();
    let declared = u32::from_be_bytes([mdat_bytes[0], mdat_bytes[1], mdat_bytes[2], mdat_bytes[3]]);
    let grown = mdat.size as u64 + payload.len() as u64;
    if declared == 1 {
        mdat_bytes[8..16].copy_from_slice(&grown.to_be_bytes());
    } else {
        if grown > u32::MAX as u64 {
            return Err("mdat growth exceeds 32-bit size".into());
        }
        mdat_bytes[0..4].copy_from_slice(&(grown as u32).to_be_bytes());
    }

    let output_len = usize::try_from(data.len() as i64 + delta_total + payload.len() as i64)
        .map_err(|_| "invalid output length")?;
    let mut out = Vec::with_capacity(output_len);
    for box_ in &top {
        if box_.box_start == meta_box.box_start {
            out.extend_from_slice(&new_meta);
        } else if box_.box_start == mdat.box_start {
            out.extend_from_slice(&mdat_bytes);
            out.extend_from_slice(payload);
        } else {
            out.extend_from_slice(&data[box_.box_start..box_.data_end]);
        }
    }
    Ok(out)
}

/// Inject a Standard texture_styles item into `data` (an XDRemux converted
/// HEIC). Rebuilds iinf/iloc/iref and shifts absolute (construction=0) iloc
/// extents by the meta growth; idat (construction=1) extents stay relative.
/// Returns the patched file bytes.
pub fn inject_texture_styles(data: &[u8], grain_seed: u64) -> Result<Vec<u8>, String> {
    let payload = texture_info_payload(grain_seed);
    inject_uri_metadata_item(data, TEXTURE_STYLES_URI, &payload)
}

/// Validate the exact plist, its containment in mdat, and its cdsc links.
/// This deliberately checks the container rather than searching file bytes
/// for a URI, which can succeed even when iloc offsets are corrupt.
pub fn verify_texture_styles(data: &[u8], payload: &[u8]) -> bool {
    let Ok(meta) = isobmff::parse_source_meta(data) else {
        return false;
    };
    let items: Vec<_> = meta
        .items
        .iter()
        .filter(|i| {
            i.raw_infe.windows(TEXTURE_STYLES_URI.len() + 1).any(|w| {
                &w[..TEXTURE_STYLES_URI.len()] == TEXTURE_STYLES_URI.as_bytes()
                    && w[TEXTURE_STYLES_URI.len()] == 0
            })
        })
        .collect();
    if items.len() != 1 {
        return false;
    }
    let id = items[0].item_id;
    let Some(loc) = meta.iloc_entries.iter().find(|e| e.item_id == id) else {
        return false;
    };
    if loc.construction_method != 0 || loc.extents.len() != 1 {
        return false;
    }
    let (off, len) = loc.extents[0];
    let Some(end) = off.checked_add(len) else {
        return false;
    };
    if end > data.len() as u64 || len != payload.len() as u64 {
        return false;
    }
    if &data[off as usize..end as usize] != payload {
        return false;
    }
    let in_mdat = isobmff::parse_boxes(data, 0, data.len())
        .iter()
        .any(|b| b.btype == *b"mdat" && off >= b.data_start as u64 && end <= b.data_end as u64);
    let linked = meta.refs.iter().any(|r| {
        r.rtype == "cdsc"
            && r.from == id
            && !r.to.is_empty()
            && r.to
                .iter()
                .all(|to| meta.items.iter().any(|i| i.item_id == *to))
            && r.to.iter().any(|to| {
                meta.items.iter().any(|i| {
                    i.item_id == *to && (i.itype.starts_with("grid") || i.itype.starts_with("hvc1"))
                })
            })
    });
    in_mdat && linked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FixtureLayout {
        meta_after_mdat: bool,
        mdat_styles: bool,
        named_items: bool,
        base_offsets: bool,
        catalog: bool,
    }

    fn fixture(with_iref: bool, primary_id: u32) -> Vec<u8> {
        fixture_layout(with_iref, primary_id, FixtureLayout::default())
    }

    // Exercise both our original writer and layouts produced by metadata
    // copying: named items, absolute Styles extents, base offsets and late meta.
    fn fixture_layout(with_iref: bool, primary_id: u32, layout: FixtureLayout) -> Vec<u8> {
        let mut writer = BplistWriter::new();
        let key = writer.add_str("1");
        let value = writer.add_data(&vec![0; 51_840]);
        let dict = writer.add_dict(&[(key, value)]);
        let styles = writer.finish(dict);
        let mut styles_infe = make_uri_metadata_infe(3, "tag:apple.com,2023:photo:metadata:styles");
        if !layout.named_items {
            let mut body = styles_infe[8..].to_vec();
            body.splice(12..21, b"styleMetadata\0".iter().copied());
            styles_infe = make_box(b"infe", &body);
        }
        let mut infes = vec![
            isobmff::make_infe_box(
                1,
                if layout.named_items {
                    "gridPrimaryImage"
                } else {
                    "grid"
                },
                0,
            ),
            isobmff::make_infe_box(
                2,
                if layout.named_items {
                    "tmapHDRGainMap"
                } else {
                    "tmap"
                },
                0,
            ),
            styles_infe,
            isobmff::make_infe_box(4, "Exif", 0),
        ];
        let catalog = b"<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><hdrgm:GainMapMax xmlns:hdrgm=\"http://ns.adobe.com/hdr-gain-map/1.0/\">1.5</hdrgm:GainMapMax></x:xmpmeta>";
        if layout.catalog {
            infes.push(isobmff::make_mime_infe_box(5, 1));
        }
        let mut ipma = vec![0, 0, 0, 0];
        ipma.extend_from_slice(&2u32.to_be_bytes());
        ipma.extend_from_slice(&isobmff::make_ipma_entry(1, &[(1, false)], 0));
        ipma.extend_from_slice(&isobmff::make_ipma_entry(2, &[(1, false), (2, false)], 0));
        let mut ipco = isobmff::make_ispe_box(4032, 3024);
        ipco.extend_from_slice(isobmff::AUX_C_BOX);
        let mut iprp = make_box(b"ipco", &ipco);
        iprp.extend_from_slice(&make_box(b"ipma", &ipma));
        let mut idat = b"tmap".to_vec();
        if !layout.mdat_styles && !layout.catalog {
            idat.extend_from_slice(&styles);
        }
        let catalog_offset = idat.len();
        if layout.catalog {
            idat.extend_from_slice(catalog);
            if !layout.mdat_styles { idat.extend_from_slice(&styles); }
        }
        let mut mdat = b"image".to_vec();
        if layout.mdat_styles {
            mdat.extend_from_slice(&styles);
        }
        if layout.catalog {
            mdat.extend_from_slice(b"exif");
        }
        let build_meta = |image_offset, exif_offset| {
            let mut locations = vec![
                isobmff::IlocEntry {
                    item_id: 1,
                    construction_method: 0,
                    data_reference_index: 0,
                    extents: vec![(image_offset, 5)],
                },
                isobmff::IlocEntry {
                    item_id: 2,
                    construction_method: 1,
                    data_reference_index: 0,
                    extents: vec![(0, 4)],
                },
                isobmff::IlocEntry {
                    item_id: 3,
                    construction_method: if layout.mdat_styles { 0 } else { 1 },
                    data_reference_index: 0,
                    extents: vec![(
                        if layout.mdat_styles {
                            image_offset + 5
                        } else if layout.catalog {
                            (catalog_offset + catalog.len()) as u64
                        } else {
                            4
                        },
                        styles.len() as u64,
                    )],
                },
                isobmff::IlocEntry {
                    item_id: 4,
                    construction_method: 0,
                    data_reference_index: 0,
                    extents: vec![(exif_offset, 4)],
                },
            ];
            if layout.catalog {
                locations.push(isobmff::IlocEntry {
                    item_id: 5,
                    construction_method: 1,
                    data_reference_index: 0,
                    extents: vec![(catalog_offset as u64, catalog.len() as u64)],
                });
            }
            let iloc = if layout.base_offsets {
                let mut payload = vec![1, 0, 0, 0, 0x44, 0x40];
                payload.extend_from_slice(&(locations.len() as u16).to_be_bytes());
                for entry in &locations {
                    let (off, len) = entry.extents[0];
                    let base = off.saturating_sub(2);
                    payload.extend_from_slice(&(entry.item_id as u16).to_be_bytes());
                    payload.extend_from_slice(&entry.construction_method.to_be_bytes());
                    payload.extend_from_slice(&0u16.to_be_bytes());
                    payload.extend_from_slice(&(base as u32).to_be_bytes());
                    payload.extend_from_slice(&1u16.to_be_bytes());
                    payload.extend_from_slice(&((off - base) as u32).to_be_bytes());
                    payload.extend_from_slice(&(len as u32).to_be_bytes());
                }
                make_box(b"iloc", &payload)
            } else {
                isobmff::make_iloc_box(&locations)
            };
            let mut body = vec![0, 0, 0, 0];
            body.extend_from_slice(&isobmff::make_pitm_box(0, primary_id));
            body.extend_from_slice(&isobmff::make_iinf_box(0, &infes));
            body.extend_from_slice(&iloc);
            body.extend_from_slice(&make_box(b"iprp", &iprp));
            body.extend_from_slice(&make_box(b"idat", &idat));
            if with_iref {
                body.extend_from_slice(&isobmff::make_iref_full_box(
                    1,
                    &[
                        isobmff::IrefEntry {
                            rtype: "dimg".into(),
                            from: 2,
                            to: vec![1],
                        },
                        isobmff::IrefEntry {
                            rtype: "cdsc".into(),
                            from: 3,
                            to: vec![1],
                        },
                    ],
                ));
            }
            make_box(b"meta", &body)
        };
        let ftyp = make_box(b"ftyp", b"heic\0\0\0\0heic");
        let meta_len = build_meta(0, 0).len();
        let image_offset =
            (ftyp.len() + if layout.meta_after_mdat { 0 } else { meta_len } + 8) as u64;
        let exif_offset = if layout.catalog {
            image_offset + mdat.len() as u64 - 4
        } else {
            (ftyp.len() + meta_len + 8 + mdat.len() + 8) as u64
        };
        let meta = build_meta(image_offset, exif_offset);
        let mdat = make_box(b"mdat", &mdat);
        let mut data = ftyp;
        if layout.meta_after_mdat {
            data.extend_from_slice(&mdat);
            data.extend_from_slice(&meta);
        } else {
            data.extend_from_slice(&meta);
            data.extend_from_slice(&mdat);
        }
        if !layout.catalog {
            data.extend_from_slice(&make_box(b"free", b"exif"));
        }
        data
    }

    #[test]
    fn catalog_updates_and_texture_insertion_preserve_the_full_styles_graph() {
        for case in 0..16 {
            let source = fixture_layout(
                true,
                1,
                FixtureLayout {
                    catalog: true,
                    mdat_styles: case & 1 != 0,
                    meta_after_mdat: case & 2 != 0,
                    base_offsets: case & 4 != 0,
                    ..FixtureLayout::default()
                },
            );
            assert!(!crate::catalog_xmp::read(&source).unwrap().is_empty());
            let new_xmp = vec![b'x'; if case & 8 == 0 { 7 } else { 5000 }];
            let updated = crate::catalog_xmp::replace(&source, &new_xmp).unwrap();
            assert_eq!(crate::catalog_xmp::read(&updated).unwrap(), new_xmp);
            let textured = inject_texture_styles(&updated, 123).unwrap();
            assert!(crate::verify_iso_gain_map(&textured));
            assert!(crate::verify_photographic_styles(&textured));
            assert!(verify_texture_styles(&textured, &texture_info_payload(123)));
            let original_meta = isobmff::parse_source_meta(&source).unwrap();
            let output_meta = isobmff::parse_source_meta(&textured).unwrap();
            let catalog_location = output_meta.iloc_entries.iter().find(|e| e.item_id == 5).unwrap();
            assert_eq!(catalog_location.construction_method, 1, "catalog stays in idat");
            for id in 1..=4 {
                assert_eq!(
                    crate::styles_attach::item_payload_bytes(&source, &original_meta, id),
                    crate::styles_attach::item_payload_bytes(&textured, &output_meta, id)
                );
            }
            for reference in &original_meta.refs {
                assert!(output_meta.refs.iter().any(|r| r.from == reference.from
                    && r.rtype == reference.rtype
                    && r.to == reference.to));
            }
            for prop in &original_meta.props {
                assert!(output_meta
                    .props
                    .iter()
                    .any(|p| p.index == prop.index && p.raw == prop.raw));
            }
        }
    }

    #[test]
    fn texture_injection_accepts_imageio_metadata_layouts() {
        for meta_after_mdat in [false, true] {
            for mdat_styles in [false, true] {
                for base_offsets in [false, true] {
                    let source = fixture_layout(
                        true,
                        0,
                        FixtureLayout {
                            meta_after_mdat,
                            mdat_styles,
                            base_offsets,
                            named_items: true,
                            ..FixtureLayout::default()
                        },
                    );
                    assert!(crate::verify_iso_gain_map(&source));
                    assert!(crate::verify_photographic_styles(&source));
                    let parsed = isobmff::parse_source_meta(&source).unwrap();
                    let original_styles =
                        crate::styles_attach::item_payload_bytes(&source, &parsed, 3).unwrap();
                    let patched = inject_texture_styles(&source, 99).unwrap();
                    assert!(verify_texture_styles(&patched, &texture_info_payload(99)));
                    assert!(crate::verify_iso_gain_map(&patched));
                    assert!(crate::verify_photographic_styles(&patched));
                    let parsed = isobmff::parse_source_meta(&patched).unwrap();
                    assert_eq!(
                        crate::styles_attach::item_payload_bytes(&patched, &parsed, 3).unwrap(),
                        original_styles
                    );
                    assert_eq!(
                        crate::styles_attach::item_payload_bytes(&patched, &parsed, 1).unwrap(),
                        b"image"
                    );
                    assert_eq!(
                        crate::styles_attach::item_payload_bytes(&patched, &parsed, 4).unwrap(),
                        b"exif"
                    );
                    assert!(parsed
                        .refs
                        .iter()
                        .any(|r| r.from == 5 && r.to == vec![1, 2]));
                }
            }
        }
    }

    #[test]
    fn texture_injection_preserves_pixels_styles_and_trailing_extents() {
        for (with_iref, primary) in [(true, 1), (false, 1), (true, 0)] {
            let source = fixture(with_iref, primary);
            let payload = texture_info_payload(1234);
            let patched = inject_texture_styles(&source, 1234).unwrap();
            assert!(verify_texture_styles(&patched, &payload));
            let meta = isobmff::parse_source_meta(&patched).unwrap();
            for (id, expected) in [(1, &b"image"[..]), (4, &b"exif"[..])] {
                let loc = meta.iloc_entries.iter().find(|e| e.item_id == id).unwrap();
                let (off, len) = loc.extents[0];
                assert_eq!(&patched[off as usize..(off + len) as usize], expected);
            }
            let loc = meta.iloc_entries.iter().find(|e| e.item_id == 3).unwrap();
            assert_eq!(loc.construction_method, 1);
            assert_eq!(loc.extents[0].0, 4);
            let top = isobmff::parse_boxes(&patched, 0, patched.len());
            let m = top.iter().find(|b| b.btype == *b"meta").unwrap();
            let children = isobmff::parse_boxes(&patched, m.data_start + 4, m.data_end);
            let idat = children.iter().find(|b| b.btype == *b"idat").unwrap();
            assert_eq!(&patched[idat.data_start..idat.data_start + 4], b"tmap");
            assert!(meta
                .refs
                .iter()
                .any(|r| r.rtype == "cdsc" && r.from == 5 && r.to == vec![1, 2]));
            assert!(inject_texture_styles(&patched, 9876).is_err());
        }
    }

    #[test]
    fn semantic_contract_preserves_items_across_metadata_layouts() {
        for case in 0..8 {
            let source=fixture_layout(true,1,FixtureLayout {
                meta_after_mdat: case & 1 != 0,
                mdat_styles: case & 2 != 0,
                base_offsets: case & 4 != 0,
                ..FixtureLayout::default()
            });
            let original=isobmff::parse_source_meta(&source).unwrap();
            let (stream,hvcc)=crate::semantic_mattes::black_matte(768,576).unwrap();
            let result=crate::semantic_mattes::inject_with_matte(&source,&stream,&hvcc).unwrap();
            assert!(crate::semantic_mattes::verify_semantic_mattes(&result));
            let updated=isobmff::parse_source_meta(&result).unwrap();
            for item in &original.items {
                assert_eq!(crate::styles_attach::item_payload_bytes(&source,&original,item.item_id),
                    crate::styles_attach::item_payload_bytes(&result,&updated,item.item_id));
            }
            for r in &original.refs { assert!(updated.refs.iter().any(|n|n.from==r.from&&n.to==r.to&&n.rtype==r.rtype)); }
            let mut incomplete=result.clone();
            let urn=crate::semantic_mattes::SEMANTIC_MATTE_URNS[11].as_bytes();
            let index=incomplete.windows(urn.len()).position(|w|w==urn).unwrap();
            incomplete[index]=b'X';
            assert!(!crate::semantic_mattes::verify_semantic_mattes(&incomplete));
        }
    }

    #[test]
    fn texture_verification_rejects_wrong_payload_or_broken_reference() {
        let payload = texture_info_payload(42);
        let mut patched = inject_texture_styles(&fixture(true, 1), 42).unwrap();
        assert!(!verify_texture_styles(&patched, &texture_info_payload(43)));
        let meta = isobmff::parse_source_meta(&patched).unwrap();
        let top = isobmff::parse_boxes(&patched, 0, patched.len());
        let m = top.iter().find(|b| b.btype == *b"meta").unwrap();
        let children = isobmff::parse_boxes(&patched, m.data_start + 4, m.data_end);
        let iref = children.iter().find(|b| b.btype == *b"iref").unwrap();
        let references = isobmff::parse_boxes(&patched, iref.data_start + 4, iref.data_end);
        let cdsc = references.last().unwrap();
        let mut broken_ref = patched.clone();
        // iref v1 uses a 32-bit from ID, a 16-bit count, then 32-bit targets.
        broken_ref[cdsc.data_start + 6..cdsc.data_start + 10]
            .copy_from_slice(&60000u32.to_be_bytes());
        assert!(!verify_texture_styles(&broken_ref, &payload));
        let loc = meta.iloc_entries.iter().find(|e| e.item_id == 5).unwrap();
        patched[loc.extents[0].0 as usize] = 0;
        assert!(!verify_texture_styles(&patched, &payload));
    }
}
