import torch
import torch.nn.functional as F
from tqdm import tqdm

from graph.state import CityState

from config import (
    DEVICE,
    LEARNING_RATE,
    WEIGHT_DECAY,
    EPOCHS,
    ROOT_LOSS_WEIGHT,
    EXPAND_LOSS_WEIGHT,
    ZONE_LOSS_WEIGHT,
    STOP_LOSS_WEIGHT,
)


def build_dynamic_features_tensor(
    assigned_zones,
    neighbor_lists,
    num_zones,
    device,
):
    from graph.features import (
        build_dynamic_features,
    )

    dynamic = build_dynamic_features(
        assigned_zones.cpu().numpy(),
        neighbor_lists,
        num_zones,
    )

    return torch.tensor(
        dynamic,
        dtype=torch.float32,
        device=device,
    )


def get_frontier(
    assigned_zones,
    zone_id,
    neighbor_lists,
):
    frontier = set()

    for node in range(
        len(assigned_zones)
    ):

        if assigned_zones[node] != zone_id:
            continue

        for neighbor in neighbor_lists[node]:

            if assigned_zones[neighbor] == -1:
                frontier.add(neighbor)

    return sorted(frontier)


def infer_active_zone(
    target,
    assigned_zones,
    neighbor_lists,
):
    for neighbor in neighbor_lists[target]:

        zone = assigned_zones[neighbor]

        if zone >= 0:
            return int(zone)

    raise ValueError(
        f"Could not infer active zone "
        f"for expansion target {target}"
    )

def train_model(
    model,
    graph,
    training_states,
    static_features,
    num_zones,
):
    device = torch.device(
        DEVICE
        if DEVICE == "cuda"
        and torch.cuda.is_available()
        else "cpu"
    )

    model = model.to(device)

    graph_x = graph.x.to(device)

    edge_index = graph.edge_index.to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
    )

    model.train()

    for epoch in range(EPOCHS):

        total_loss = 0.0

        progress = tqdm(
            training_states,
            desc=f"Epoch {epoch + 1}/{EPOCHS}",
        )

        for state in progress:

            assigned = state.assigned_zones

            dynamic_features = (
                build_dynamic_features_tensor(
                    assigned,
                    graph.neighbor_lists,
                    num_zones,
                    device,
                )
            )

            x = torch.cat(
                [
                    graph_x,
                    dynamic_features,
                ],
                dim=1,
            )

            outputs = model(
                x,
                edge_index,
            )

            loss = torch.tensor(
                0.0,
                device=device,
            )

            # --------------------
            # ROOT
            # --------------------

            if state.root_target is not None:

                target = torch.tensor(
                    state.root_target,
                    dtype=torch.long,
                    device=device,
                )

                root_logits = (
                    outputs["root_logits"]
                )

                root_loss = F.cross_entropy(
                    root_logits.unsqueeze(0),
                    target.unsqueeze(0),
                )

                loss = (
                    loss
                    + ROOT_LOSS_WEIGHT
                    * root_loss
                )

                # ----------------
                # ZONE
                # ----------------

                zone_target = torch.tensor(
                    state.zone_target,
                    dtype=torch.long,
                    device=device,
                )

                # At this point we want
                # the chosen root's zone.
                root_embedding = outputs[
                    "embeddings"
                ][state.root_target]

                zone_logits = model.zone_head(
                    root_embedding
                ).unsqueeze(0)

                zone_loss = F.cross_entropy(
                    zone_logits,
                    zone_target.unsqueeze(0),
                )

                loss = (
                    loss
                    + ZONE_LOSS_WEIGHT
                    * zone_loss
                )

            # --------------------
            # EXPANSION
            # --------------------

            if state.expand_target is not None:

                zone_id = int(
                    state.assigned_zones[
                        state.expand_target
                    ]
                )

                # The target is an unassigned node
                # before the action, so infer the
                # active zone from neighbouring
                # assigned nodes.
                zone_id = infer_active_zone(
                    state.expand_target,
                    state.assigned_zones,
                    graph.neighbor_lists,
                )

                candidates = get_frontier(
                    state.assigned_zones,
                    zone_id,
                    graph.neighbor_lists,
                )

                if candidates:

                    candidates_tensor = torch.tensor(
                        candidates,
                        dtype=torch.long,
                        device=device,
                    )

                    logits = model.expansion_scores(
                        outputs["embeddings"],
                        candidates_tensor,
                        zone_id,
                    )

                    target_index = candidates.index(
                        state.expand_target
                    )

                    target = torch.tensor(
                        target_index,
                        dtype=torch.long,
                        device=device,
                    )

                    expand_loss = F.cross_entropy(
                        logits.unsqueeze(0),
                        target.unsqueeze(0),
                    )

                    loss = (
                        loss
                        + EXPAND_LOSS_WEIGHT
                        * expand_loss
                    )

            # --------------------
            # BACKPROP
            # --------------------

            optimizer.zero_grad()

            loss.backward()

            torch.nn.utils.clip_grad_norm_(
                model.parameters(),
                max_norm=1.0,
            )

            optimizer.step()

            total_loss += loss.item()

            progress.set_postfix(
                loss=loss.item()
            )

        average_loss = (
            total_loss / len(training_states)
        )

        print(
            f"Epoch {epoch + 1}: "
            f"loss={average_loss:.5f}"
        )

    return model
