/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { BUILTIN_INSTLLATION_ADMIN_USER_ID, TypeORM, UserDB } from "@gitpod/gitpod-db/lib";
import { Organization, OrganizationSettings, TeamMemberRole, User } from "@gitpod/gitpod-protocol";
import { Experiments } from "@gitpod/gitpod-protocol/lib/experiments/configcat-server";
import { ErrorCodes } from "@gitpod/gitpod-protocol/lib/messaging/error";
import * as chai from "chai";
import { Container } from "inversify";
import "mocha";
import { createTestContainer, withTestCtx } from "../test/service-testing-container-module";
import { OrganizationService } from "./organization-service";
import { resetDB } from "@gitpod/gitpod-db/lib/test/reset-db";
import { expectError } from "../test/expect-utils";
import { UserService } from "../user/user-service";
import { DefaultWorkspaceImageValidator } from "./default-workspace-image-validator";
import { SYSTEM_USER } from "../authorization/authorizer";
import { IDEService } from "../ide-service";

const expect = chai.expect;

describe("OrganizationService", async () => {
    let container: Container;
    let os: OrganizationService;
    let userService: UserService;

    let owner: User;
    let member: User;
    let collaborator: User;
    let stranger: User;
    const adminId = BUILTIN_INSTLLATION_ADMIN_USER_ID;
    let org: Organization;
    let org2: Organization;
    let validateDefaultWorkspaceImage: DefaultWorkspaceImageValidator | undefined;

    beforeEach(async () => {
        container = createTestContainer();
        Experiments.configureTestingClient({
            dataops: true,
        });
        validateDefaultWorkspaceImage = undefined;
        container
            .rebind<DefaultWorkspaceImageValidator>(DefaultWorkspaceImageValidator)
            .toDynamicValue(() => async (userId, imageRef) => {
                if (validateDefaultWorkspaceImage) {
                    await validateDefaultWorkspaceImage(userId, imageRef);
                }
            });
        // Setup
        container.rebind<IDEService>(IDEService).toConstantValue({
            getIDEConfig: async () => ({
                supervisorImage: "foo",
                ideOptions: {
                    options: {
                        code: {
                            orderKey: "00",
                            title: "VS Code",
                            type: "browser",
                            logo: "https://ide.gitpod.io/image/ide-logo/vscode.svg",
                            label: "Browser",
                            image: "bar",
                            latestImage: "baz",
                            versions: [{ version: "1.2.3" }],
                        },
                        intellij: {
                            orderKey: "01",
                            title: "Intellij",
                            type: "desktop",
                            logo: "https://ide.gitpod.io/image/ide-logo/intellij.svg",
                            label: "Desktop",
                            image: "bar",
                            latestImage: "baz",
                            versions: [{ version: "4.5.6" }],
                        },
                    },
                },
            }),
        } as any as IDEService);
        os = container.get(OrganizationService);
        userService = container.get<UserService>(UserService);
        owner = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        const invite = await withTestCtx(owner.id, async () => {
            org = await os.createOrganization(owner.id, "myorg");
            return await os.getOrCreateInvite(owner.id, org.id);
        });

        member = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        await withTestCtx(owner.id, () =>
            os.addOrUpdateMember(owner.id, org.id, member.id, "member", { flexibleRole: false }),
        );

        collaborator = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });

        await withTestCtx(SYSTEM_USER, () => os.joinOrganization(collaborator.id, invite.id));

        org2 = await withTestCtx(owner.id, () => os.createOrganization(owner.id, "org2"));

        stranger = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
    });

    afterEach(async () => {
        // Clean-up database
        await resetDB(container.get(TypeORM));
        // Deactivate all services
        await container.unbindAllAsync();
    });

    it("should deleteOrganization", async () => {
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.deleteOrganization(member.id, org.id)),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.deleteOrganization(collaborator.id, org.id)),
        );
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.deleteOrganization(stranger.id, org.id)),
        );

        await withTestCtx(owner.id, () => os.deleteOrganization(owner.id, org.id));
    });

    it("should getOrCreateInvite and resetInvite", async () => {
        expect(org.name).to.equal("myorg");

        const invite = await withTestCtx(owner.id, () => os.getOrCreateInvite(owner.id, org.id));
        expect(invite).to.not.be.undefined;

        const invite2 = await withTestCtx(member.id, () => os.getOrCreateInvite(member.id, org.id));
        expect(invite2.id).to.equal(invite.id);

        const invite3 = await withTestCtx(owner.id, () => os.resetInvite(owner.id, org.id));
        expect(invite3.id).to.not.equal(invite.id);

        const invite4 = await withTestCtx(member.id, () => os.resetInvite(member.id, org.id));
        expect(invite4.id).to.not.equal(invite3.id);

        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.getOrCreateInvite(collaborator.id, org.id)),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.resetInvite(collaborator.id, org.id)),
        );

        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.getOrCreateInvite(stranger.id, org.id)),
        );
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.resetInvite(stranger.id, org.id)),
        );
    });

    it("re-join org should not change role", async () => {
        const invite = await withTestCtx(owner.id, () => os.getOrCreateInvite(owner.id, org.id));
        expect(invite).to.not.be.undefined;

        await assertUserRole(owner.id, "owner");
        await assertUserRole(member.id, "member");
        await assertUserRole(collaborator.id, "collaborator");

        await withTestCtx(SYSTEM_USER, () => os.joinOrganization(owner.id, invite.id));
        await assertUserRole(owner.id, "owner");

        await withTestCtx(SYSTEM_USER, () => os.joinOrganization(member.id, invite.id));
        await assertUserRole(member.id, "member");

        await withTestCtx(SYSTEM_USER, () => os.joinOrganization(collaborator.id, invite.id));
        await assertUserRole(collaborator.id, "collaborator");
    });

    it("should listMembers", async () => {
        let members = await withTestCtx(owner.id, () => os.listMembers(owner.id, org.id));
        expect(members.length).to.eq(3);
        expect(members.some((m) => m.userId === owner.id)).to.be.true;
        expect(members.some((m) => m.userId === member.id)).to.be.true;

        members = await withTestCtx(member.id, () => os.listMembers(member.id, org.id));
        expect(members.length).to.eq(3);
        expect(members.some((m) => m.userId === owner.id)).to.be.true;
        expect(members.some((m) => m.userId === member.id)).to.be.true;

        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.listMembers(collaborator.id, org.id)),
        );
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.listMembers(stranger.id, org.id)),
        );
    });

    const assertUserRole = async (userId: string, role: TeamMemberRole) => {
        const list = await withTestCtx(owner.id, () => os.listMembers(owner.id, org.id));
        expect(list.find((m) => m.userId === userId)?.role).to.be.equal(role);
    };

    it("should setOrganizationMemberRole and removeOrganizationMember", async () => {
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.addOrUpdateMember(member.id, org.id, owner.id, "member")),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.addOrUpdateMember(collaborator.id, org.id, owner.id, "member")),
        );

        // try upgrade the member to owner
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.addOrUpdateMember(member.id, org.id, member.id, "owner")),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.addOrUpdateMember(collaborator.id, org.id, member.id, "owner")),
        );

        // try removing the owner
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.removeOrganizationMember(member.id, org.id, owner.id)),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.removeOrganizationMember(collaborator.id, org.id, owner.id)),
        );

        // owner can't downgrade if org only have on owner
        await withTestCtx(owner.id, () => os.addOrUpdateMember(owner.id, org.id, owner.id, "member"));
        await assertUserRole(owner.id, "owner");

        // owners can upgrade members
        await withTestCtx(owner.id, () => os.addOrUpdateMember(owner.id, org.id, member.id, "owner"));

        // owner can downgrade themselves
        await withTestCtx(owner.id, () => os.addOrUpdateMember(owner.id, org.id, owner.id, "member"));

        // assert that the member no longer has owner permissions
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(owner.id, () => os.deleteOrganization(owner.id, org.id)),
        );

        // owner and member have switched roles now
        const previouslyMember = member;
        member = owner;
        owner = previouslyMember;

        // owner can downgrade themselves only if they are not the last owner
        await withTestCtx(owner.id, () => os.addOrUpdateMember(owner.id, org.id, owner.id, "member"));
        // verify they are still an owner
        await assertUserRole(owner.id, "owner");

        // owner can delete themselves only if they are not the last owner
        await expectError(ErrorCodes.CONFLICT, () =>
            withTestCtx(owner.id, () => os.removeOrganizationMember(owner.id, org.id, owner.id)),
        );

        // members can remove themselves
        await withTestCtx(member.id, () => os.removeOrganizationMember(member.id, org.id, member.id));
        // collaborators can remove themselves
        await withTestCtx(collaborator.id, () => os.removeOrganizationMember(collaborator.id, org.id, collaborator.id));

        // try remove the member again
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(member.id, () => os.removeOrganizationMember(member.id, org.id, member.id)),
        );
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(collaborator.id, () => os.removeOrganizationMember(collaborator.id, org.id, collaborator.id)),
        );
    });

    it("should delete owned user when removing it", async () => {
        const ownedMember = await userService.createUser({
            organizationId: org.id,
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        await withTestCtx(owner.id, () => os.addOrUpdateMember(owner.id, org.id, ownedMember.id, "member"));

        const members = await withTestCtx(owner.id, () => os.listMembers(owner.id, org.id));
        expect(members.some((m) => m.userId === ownedMember.id)).to.be.true;

        // remove it and assert it's gone
        await withTestCtx(owner.id, () => os.removeOrganizationMember(owner.id, org.id, ownedMember.id));
        const members2 = await withTestCtx(owner.id, () => os.listMembers(owner.id, org.id));
        expect(members2.some((m) => m.userId === ownedMember.id)).to.be.false;
        // also assert that the user is gone
        const deleted = withTestCtx(ownedMember.id, () => userService.findUserById(ownedMember.id, ownedMember.id));
        await expectError(ErrorCodes.NOT_FOUND, () => deleted);
    });

    it("should listOrganizationsByMember", async () => {
        await withTestCtx(owner.id, async () => {
            await os.createOrganization(owner.id, "org1");
            await os.createOrganization(owner.id, "org2");
        });
        let orgs = await withTestCtx(owner.id, () => os.listOrganizationsByMember(owner.id, owner.id));
        expect(orgs.length).to.eq(4);
        orgs = await withTestCtx(member.id, () => os.listOrganizationsByMember(member.id, member.id));
        expect(orgs.length).to.eq(1);
        orgs = await withTestCtx(collaborator.id, () => os.listOrganizationsByMember(collaborator.id, collaborator.id));
        expect(orgs.length).to.eq(1);
        orgs = await withTestCtx(stranger.id, () => os.listOrganizationsByMember(stranger.id, stranger.id));
        expect(orgs.length).to.eq(0);
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.listOrganizationsByMember(stranger.id, owner.id)),
        );
    });

    it("should getOrganization", async () => {
        const foundOrg = await withTestCtx(owner.id, () => os.getOrganization(owner.id, org.id));
        expect(foundOrg.name).to.equal(org.name);

        const foundByMember = await withTestCtx(member.id, () => os.getOrganization(member.id, org.id));
        expect(foundByMember.name).to.equal(org.name);

        const foundByCollaborator = await withTestCtx(collaborator.id, () =>
            os.getOrganization(collaborator.id, org.id),
        );
        expect(foundByCollaborator.name).to.equal(org.name);

        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.getOrganization(stranger.id, org.id)),
        );
    });

    it("should updateOrganization", async () => {
        org.name = "newName";
        await withTestCtx(owner.id, () => os.updateOrganization(owner.id, org.id, org));
        const updated = await withTestCtx(owner.id, () => os.getOrganization(owner.id, org.id));
        expect(updated.name).to.equal(org.name);

        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.updateOrganization(member.id, org.id, org)),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.updateOrganization(collaborator.id, org.id, org)),
        );
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.updateOrganization(stranger.id, org.id, org)),
        );
    });

    it("should getSettings and updateSettings", async () => {
        const settings = await withTestCtx(owner.id, () => os.getSettings(owner.id, org.id));
        expect(settings).to.not.be.undefined;
        expect(settings).to.not.be.null;

        settings.workspaceSharingDisabled = true;

        await withTestCtx(owner.id, () => os.updateSettings(owner.id, org.id, settings));
        const updated = await withTestCtx(owner.id, () => os.getSettings(owner.id, org.id));
        expect(updated.workspaceSharingDisabled).to.be.true;

        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.updateSettings(member.id, org.id, settings)),
        );
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(collaborator.id, () => os.updateSettings(collaborator.id, org.id, settings)),
        );
        await expectError(ErrorCodes.NOT_FOUND, () =>
            withTestCtx(stranger.id, () => os.updateSettings(stranger.id, org.id, settings)),
        );
    });

    it("should allow admins to do its thing", async () => {
        await withTestCtx(adminId, async () => {
            await os.updateOrganization(adminId, org.id, { name: "Name Changed" });
            const updated = await os.getOrganization(adminId, org.id);
            expect(updated.name).to.equal("Name Changed");

            await os.updateSettings(adminId, org.id, { workspaceSharingDisabled: true });
            const settings = await os.getSettings(adminId, org.id);
            expect(settings.workspaceSharingDisabled).to.be.true;
        });
    });

    it("should remove the admin on first join", async () => {
        const myOrg = await withTestCtx(adminId, () => os.createOrganization(adminId, "My Org"));
        expect((await withTestCtx(adminId, () => os.listMembers(adminId, myOrg.id))).length).to.eq(1);

        await withTestCtx(adminId, async () => {
            // add a another member which should become owner
            await os.addOrUpdateMember(adminId, myOrg.id, owner.id, "member");
        });

        // admin should have been removed
        const members = await withTestCtx(owner.id, () => os.listMembers(owner.id, myOrg.id));
        expect(members.length).to.eq(1);
        expect(members.some((m) => m.userId === owner.id && m.role === "owner")).to.be.true;
    });

    it("should listOrganizations (for installation)", async () => {
        const strangerOrg = await withTestCtx(stranger.id, () => os.createOrganization(stranger.id, "stranger-org"));
        let orgs = await withTestCtx(owner.id, () => os.listOrganizations(owner.id, {}, "installation"));
        expect(orgs.rows.map((o) => o.id)).to.contain(org.id);
        expect(orgs.rows.map((o) => o.id)).to.contain(org2.id);
        expect(orgs.total).to.eq(2);

        orgs = await withTestCtx(stranger.id, () => os.listOrganizations(stranger.id, {}, "installation"));
        expect(orgs.rows[0].id).to.eq(strangerOrg.id);
        expect(orgs.total).to.eq(1);

        orgs = await withTestCtx(adminId, () => os.listOrganizations(adminId, {}, "installation"));
        expect(orgs.rows.some((org) => org.id === org.id)).to.be.true;
        expect(orgs.rows.some((org) => org.id === strangerOrg.id)).to.be.true;
        expect(orgs.total).to.eq(3);
    });

    it("should listOrganizations (for member)", async () => {
        // Owner is member of both orgs
        const ownerResult = await withTestCtx(owner.id, () => os.listOrganizations(owner.id, {}, "member"));
        expect(ownerResult.rows.map((o) => o.id)).to.include(org.id);
        expect(ownerResult.rows.map((o) => o.id)).to.include(org2.id);

        // Member is only in org1
        const memberResult = await withTestCtx(member.id, () => os.listOrganizations(member.id, {}, "member"));
        expect(memberResult.rows.map((o) => o.id)).to.include(org.id);
        expect(memberResult.rows.map((o) => o.id)).to.not.include(org2.id);

        // Collaborator is only in org1
        const collaboratorResults = await withTestCtx(collaborator.id, () =>
            os.listOrganizations(collaborator.id, {}, "member"),
        );
        expect(collaboratorResults.rows.map((o) => o.id)).to.include(org.id);
        expect(collaboratorResults.rows.map((o) => o.id)).to.not.include(org2.id);

        // Stranger is in no orgs
        const strangerResult = await withTestCtx(stranger.id, () => os.listOrganizations(stranger.id, {}, "member"));
        expect(strangerResult.total).to.equal(0);
    });

    it("should ad as collaborator with dataops + flexibleRole", async () => {
        await assertUserRole(collaborator.id, "collaborator");
        const u2 = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        await withTestCtx(owner.id, async () => {
            await os.addOrUpdateMember(owner.id, org.id, u2.id, "member");
            await assertUserRole(u2.id, "member");
            // flexibleRole: true + dataops should be collaborator
            await os.addOrUpdateMember(owner.id, org.id, u2.id, "member", { flexibleRole: true });
            await assertUserRole(u2.id, "collaborator");
        });
    });

    it("should add as set defaultRole with flexibleRole", async () => {
        Experiments.configureTestingClient({
            dataops: false,
        });
        await assertUserRole(collaborator.id, "collaborator");
        await withTestCtx(adminId, () => os.updateSettings(adminId, org.id, { defaultRole: "owner" }));
        const u2 = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        await withTestCtx(owner.id, () =>
            os.addOrUpdateMember(owner.id, org.id, u2.id, "member", { flexibleRole: true }),
        );
        await assertUserRole(u2.id, "owner");
    });

    it("should join an org with different cell id", async () => {
        Experiments.configureTestingClient({
            dataops: false,
        });
        const u1 = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        const invite = await withTestCtx(owner.id, () => os.getOrCreateInvite(owner.id, org.id));

        await withTestCtx(SYSTEM_USER, () => os.joinOrganization(u1.id, invite.id));
        await assertUserRole(u1.id, "member");

        Experiments.configureTestingClient({
            dataops: true,
        });
        const u2 = await userService.createUser({
            identity: {
                authId: "github|1234",
                authName: "github",
                authProviderId: "github",
            },
        });
        await withTestCtx(SYSTEM_USER, () => os.joinOrganization(u2.id, invite.id));
        await assertUserRole(u2.id, "collaborator");
    });

    it("should manage settings", async () => {
        const myOrg = await withTestCtx(adminId, () => os.createOrganization(adminId, "My Org"));
        const settings = await withTestCtx(adminId, () => os.getSettings(adminId, myOrg.id));
        expect(settings).to.deep.eq(<OrganizationSettings>{}, "initial setttings");

        const assertUpdateSettings = async (
            message: string,
            update: Partial<OrganizationSettings>,
            expected: OrganizationSettings,
        ) => {
            const updated = await withTestCtx(adminId, () => os.updateSettings(adminId, myOrg.id, update));
            expect(updated).to.deep.eq(expected, message + " (update)");
            const verified = await withTestCtx(adminId, () => os.getSettings(adminId, myOrg.id));
            expect(verified).to.deep.eq(expected, message + " (get)");
        };

        await assertUpdateSettings(
            "should disable workspace sharing",
            { workspaceSharingDisabled: true },
            {
                workspaceSharingDisabled: true,
            },
        );
        await assertUpdateSettings(
            "should update default workspace image",
            { defaultWorkspaceImage: "ubuntu" },
            {
                workspaceSharingDisabled: true,
                defaultWorkspaceImage: "ubuntu",
            },
        );

        await assertUpdateSettings(
            "should update allowed workspace classes",
            { allowedWorkspaceClasses: ["default"] },
            {
                workspaceSharingDisabled: true,
                defaultWorkspaceImage: "ubuntu",
                allowedWorkspaceClasses: ["default"],
            },
        );

        try {
            await withTestCtx(adminId, () =>
                os.updateSettings(adminId, myOrg.id, { allowedWorkspaceClasses: ["foo"] }),
            );
            expect.fail("should have failed");
        } catch (err) {
            expect(err.message).to.equal("items in allowedWorkspaceClasses are not all allowed", "invalid classes");
        }

        await assertUpdateSettings(
            "empty allowed workspace classes should allow all ([])",
            { allowedWorkspaceClasses: [] },
            {
                allowedWorkspaceClasses: [],
                workspaceSharingDisabled: true,
                defaultWorkspaceImage: "ubuntu",
            },
        );

        validateDefaultWorkspaceImage = () => {
            throw new Error("invalid image");
        };
        try {
            await withTestCtx(adminId, () => os.updateSettings(adminId, myOrg.id, { defaultWorkspaceImage: "lalala" }));
            expect.fail("should have failed");
        } catch (err) {
            expect(err.message).to.equal("invalid image", "should validate default workspace image");
        }

        validateDefaultWorkspaceImage = undefined;
        await assertUpdateSettings(
            "should reset default workspace image",
            { defaultWorkspaceImage: "" },
            {
                allowedWorkspaceClasses: [],
                workspaceSharingDisabled: true,
                defaultWorkspaceImage: "",
            },
        );
        await assertUpdateSettings(
            "should enable workspace sharing",
            { workspaceSharingDisabled: false },
            {
                allowedWorkspaceClasses: [],
                defaultWorkspaceImage: "",
            },
        );
    });

    it("org-owned users can't create new organizations", async () => {
        const userDB = container.get<UserDB>(UserDB);
        const os = container.get(OrganizationService);

        // create the owner (installation-level)
        const owner = await userDB.newUser();

        // create an org
        const orgService = container.get(OrganizationService);
        const myOrg = await withTestCtx(owner.id, () => orgService.createOrganization(owner.id, "my-org"));

        // create org-owned user
        const member = await createOrgOwnedUser(os, myOrg.id);

        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.createOrganization(member.id, "member's crew")),
        );
    });

    it("org-owned users can't join another org", async () => {
        const userDB = container.get<UserDB>(UserDB);
        const os = container.get(OrganizationService);

        // create the owner (installation-level)
        const owner = await userDB.newUser();

        // create the orgs
        const orgService = container.get(OrganizationService);
        const myOrg = await withTestCtx(owner.id, () => orgService.createOrganization(owner.id, "my-org"));
        const anotherOrg = await withTestCtx(owner.id, () => orgService.createOrganization(owner.id, "another-org"));

        // create org-owned user
        const member = await createOrgOwnedUser(os, myOrg.id);

        const failingInvite = await withTestCtx(owner.id, () => orgService.getOrCreateInvite(owner.id, anotherOrg.id));
        await expectError(ErrorCodes.PERMISSION_DENIED, () =>
            withTestCtx(member.id, () => os.joinOrganization(member.id, failingInvite.id)),
        );
    });

    it("should update pinnedEditorVersions", async () => {
        // Create a test organization
        const myOrg = await withTestCtx(adminId, () => os.createOrganization(adminId, "My Org"));

        // Test 1: Set specific pinned editor versions
        const pinnedVersions = { code: "1.2.3", intellij: "4.5.6" };
        await withTestCtx(adminId, () =>
            os.updateSettings(adminId, myOrg.id, { pinnedEditorVersions: pinnedVersions }),
        );

        // Verify the settings were updated correctly
        let settings = await withTestCtx(adminId, () => os.getSettings(adminId, myOrg.id));
        expect(settings.pinnedEditorVersions).to.deep.equal(pinnedVersions);

        // Test 2: Unset all pinned versions by setting an empty object
        await withTestCtx(adminId, () => os.updateSettings(adminId, myOrg.id, { pinnedEditorVersions: {} }));

        // Verify all pinned versions were removed
        settings = await withTestCtx(adminId, () => os.getSettings(adminId, myOrg.id));
        expect(settings.pinnedEditorVersions).to.deep.equal({});
    });
});

async function createOrgOwnedUser(os: OrganizationService, organizationId: string) {
    // create org-owned member
    return os.createOrgOwnedUser({
        organizationId,
        identity: {
            authId: "123",
            authProviderId: "https://accounts.google.com",
            authName: "member",
            lastSigninTime: new Date().toISOString(),
        },
        userUpdate: (user) => {},
    });
}
