// Copyright (c) 2025 Gitpod GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License.AGPL.txt in the project root for license information.

// Code generated by protoc-gen-go-grpc. DO NOT EDIT.
// versions:
// - protoc-gen-go-grpc v1.2.0
// - protoc             v3.20.1
// source: imgbuilder.proto

package api

import (
	context "context"
	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	status "google.golang.org/grpc/status"
)

// This is a compile-time assertion to ensure that this generated file
// is compatible with the grpc package it is being compiled against.
// Requires gRPC-Go v1.32.0 or later.
const _ = grpc.SupportPackageIsVersion7

// ImageBuilderClient is the client API for ImageBuilder service.
//
// For semantics around ctx use and closing/ending streaming RPCs, please refer to https://pkg.go.dev/google.golang.org/grpc/?tab=doc#ClientConn.NewStream.
type ImageBuilderClient interface {
	// ResolveBaseImage returns the "digest" form of a Docker image tag thereby making it absolute.
	ResolveBaseImage(ctx context.Context, in *ResolveBaseImageRequest, opts ...grpc.CallOption) (*ResolveBaseImageResponse, error)
	// ResolveWorkspaceImage returns information about a build configuration without actually attempting to build anything.
	ResolveWorkspaceImage(ctx context.Context, in *ResolveWorkspaceImageRequest, opts ...grpc.CallOption) (*ResolveWorkspaceImageResponse, error)
	// Build initiates the build of a Docker image using a build configuration. If a build of this
	// configuration is already ongoing no new build will be started.
	Build(ctx context.Context, in *BuildRequest, opts ...grpc.CallOption) (ImageBuilder_BuildClient, error)
	// Logs listens to the build output of an ongoing Docker build identified build the build ID
	Logs(ctx context.Context, in *LogsRequest, opts ...grpc.CallOption) (ImageBuilder_LogsClient, error)
	// ListBuilds returns a list of currently running builds
	ListBuilds(ctx context.Context, in *ListBuildsRequest, opts ...grpc.CallOption) (*ListBuildsResponse, error)
}

type imageBuilderClient struct {
	cc grpc.ClientConnInterface
}

func NewImageBuilderClient(cc grpc.ClientConnInterface) ImageBuilderClient {
	return &imageBuilderClient{cc}
}

func (c *imageBuilderClient) ResolveBaseImage(ctx context.Context, in *ResolveBaseImageRequest, opts ...grpc.CallOption) (*ResolveBaseImageResponse, error) {
	out := new(ResolveBaseImageResponse)
	err := c.cc.Invoke(ctx, "/builder.ImageBuilder/ResolveBaseImage", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *imageBuilderClient) ResolveWorkspaceImage(ctx context.Context, in *ResolveWorkspaceImageRequest, opts ...grpc.CallOption) (*ResolveWorkspaceImageResponse, error) {
	out := new(ResolveWorkspaceImageResponse)
	err := c.cc.Invoke(ctx, "/builder.ImageBuilder/ResolveWorkspaceImage", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *imageBuilderClient) Build(ctx context.Context, in *BuildRequest, opts ...grpc.CallOption) (ImageBuilder_BuildClient, error) {
	stream, err := c.cc.NewStream(ctx, &ImageBuilder_ServiceDesc.Streams[0], "/builder.ImageBuilder/Build", opts...)
	if err != nil {
		return nil, err
	}
	x := &imageBuilderBuildClient{stream}
	if err := x.ClientStream.SendMsg(in); err != nil {
		return nil, err
	}
	if err := x.ClientStream.CloseSend(); err != nil {
		return nil, err
	}
	return x, nil
}

type ImageBuilder_BuildClient interface {
	Recv() (*BuildResponse, error)
	grpc.ClientStream
}

type imageBuilderBuildClient struct {
	grpc.ClientStream
}

func (x *imageBuilderBuildClient) Recv() (*BuildResponse, error) {
	m := new(BuildResponse)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (c *imageBuilderClient) Logs(ctx context.Context, in *LogsRequest, opts ...grpc.CallOption) (ImageBuilder_LogsClient, error) {
	stream, err := c.cc.NewStream(ctx, &ImageBuilder_ServiceDesc.Streams[1], "/builder.ImageBuilder/Logs", opts...)
	if err != nil {
		return nil, err
	}
	x := &imageBuilderLogsClient{stream}
	if err := x.ClientStream.SendMsg(in); err != nil {
		return nil, err
	}
	if err := x.ClientStream.CloseSend(); err != nil {
		return nil, err
	}
	return x, nil
}

type ImageBuilder_LogsClient interface {
	Recv() (*LogsResponse, error)
	grpc.ClientStream
}

type imageBuilderLogsClient struct {
	grpc.ClientStream
}

func (x *imageBuilderLogsClient) Recv() (*LogsResponse, error) {
	m := new(LogsResponse)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (c *imageBuilderClient) ListBuilds(ctx context.Context, in *ListBuildsRequest, opts ...grpc.CallOption) (*ListBuildsResponse, error) {
	out := new(ListBuildsResponse)
	err := c.cc.Invoke(ctx, "/builder.ImageBuilder/ListBuilds", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ImageBuilderServer is the server API for ImageBuilder service.
// All implementations must embed UnimplementedImageBuilderServer
// for forward compatibility
type ImageBuilderServer interface {
	// ResolveBaseImage returns the "digest" form of a Docker image tag thereby making it absolute.
	ResolveBaseImage(context.Context, *ResolveBaseImageRequest) (*ResolveBaseImageResponse, error)
	// ResolveWorkspaceImage returns information about a build configuration without actually attempting to build anything.
	ResolveWorkspaceImage(context.Context, *ResolveWorkspaceImageRequest) (*ResolveWorkspaceImageResponse, error)
	// Build initiates the build of a Docker image using a build configuration. If a build of this
	// configuration is already ongoing no new build will be started.
	Build(*BuildRequest, ImageBuilder_BuildServer) error
	// Logs listens to the build output of an ongoing Docker build identified build the build ID
	Logs(*LogsRequest, ImageBuilder_LogsServer) error
	// ListBuilds returns a list of currently running builds
	ListBuilds(context.Context, *ListBuildsRequest) (*ListBuildsResponse, error)
	mustEmbedUnimplementedImageBuilderServer()
}

// UnimplementedImageBuilderServer must be embedded to have forward compatible implementations.
type UnimplementedImageBuilderServer struct {
}

func (UnimplementedImageBuilderServer) ResolveBaseImage(context.Context, *ResolveBaseImageRequest) (*ResolveBaseImageResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ResolveBaseImage not implemented")
}
func (UnimplementedImageBuilderServer) ResolveWorkspaceImage(context.Context, *ResolveWorkspaceImageRequest) (*ResolveWorkspaceImageResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ResolveWorkspaceImage not implemented")
}
func (UnimplementedImageBuilderServer) Build(*BuildRequest, ImageBuilder_BuildServer) error {
	return status.Errorf(codes.Unimplemented, "method Build not implemented")
}
func (UnimplementedImageBuilderServer) Logs(*LogsRequest, ImageBuilder_LogsServer) error {
	return status.Errorf(codes.Unimplemented, "method Logs not implemented")
}
func (UnimplementedImageBuilderServer) ListBuilds(context.Context, *ListBuildsRequest) (*ListBuildsResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ListBuilds not implemented")
}
func (UnimplementedImageBuilderServer) mustEmbedUnimplementedImageBuilderServer() {}

// UnsafeImageBuilderServer may be embedded to opt out of forward compatibility for this service.
// Use of this interface is not recommended, as added methods to ImageBuilderServer will
// result in compilation errors.
type UnsafeImageBuilderServer interface {
	mustEmbedUnimplementedImageBuilderServer()
}

func RegisterImageBuilderServer(s grpc.ServiceRegistrar, srv ImageBuilderServer) {
	s.RegisterService(&ImageBuilder_ServiceDesc, srv)
}

func _ImageBuilder_ResolveBaseImage_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ResolveBaseImageRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(ImageBuilderServer).ResolveBaseImage(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/builder.ImageBuilder/ResolveBaseImage",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(ImageBuilderServer).ResolveBaseImage(ctx, req.(*ResolveBaseImageRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _ImageBuilder_ResolveWorkspaceImage_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ResolveWorkspaceImageRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(ImageBuilderServer).ResolveWorkspaceImage(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/builder.ImageBuilder/ResolveWorkspaceImage",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(ImageBuilderServer).ResolveWorkspaceImage(ctx, req.(*ResolveWorkspaceImageRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _ImageBuilder_Build_Handler(srv interface{}, stream grpc.ServerStream) error {
	m := new(BuildRequest)
	if err := stream.RecvMsg(m); err != nil {
		return err
	}
	return srv.(ImageBuilderServer).Build(m, &imageBuilderBuildServer{stream})
}

type ImageBuilder_BuildServer interface {
	Send(*BuildResponse) error
	grpc.ServerStream
}

type imageBuilderBuildServer struct {
	grpc.ServerStream
}

func (x *imageBuilderBuildServer) Send(m *BuildResponse) error {
	return x.ServerStream.SendMsg(m)
}

func _ImageBuilder_Logs_Handler(srv interface{}, stream grpc.ServerStream) error {
	m := new(LogsRequest)
	if err := stream.RecvMsg(m); err != nil {
		return err
	}
	return srv.(ImageBuilderServer).Logs(m, &imageBuilderLogsServer{stream})
}

type ImageBuilder_LogsServer interface {
	Send(*LogsResponse) error
	grpc.ServerStream
}

type imageBuilderLogsServer struct {
	grpc.ServerStream
}

func (x *imageBuilderLogsServer) Send(m *LogsResponse) error {
	return x.ServerStream.SendMsg(m)
}

func _ImageBuilder_ListBuilds_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ListBuildsRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(ImageBuilderServer).ListBuilds(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/builder.ImageBuilder/ListBuilds",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(ImageBuilderServer).ListBuilds(ctx, req.(*ListBuildsRequest))
	}
	return interceptor(ctx, in, info, handler)
}

// ImageBuilder_ServiceDesc is the grpc.ServiceDesc for ImageBuilder service.
// It's only intended for direct use with grpc.RegisterService,
// and not to be introspected or modified (even as a copy)
var ImageBuilder_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "builder.ImageBuilder",
	HandlerType: (*ImageBuilderServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "ResolveBaseImage",
			Handler:    _ImageBuilder_ResolveBaseImage_Handler,
		},
		{
			MethodName: "ResolveWorkspaceImage",
			Handler:    _ImageBuilder_ResolveWorkspaceImage_Handler,
		},
		{
			MethodName: "ListBuilds",
			Handler:    _ImageBuilder_ListBuilds_Handler,
		},
	},
	Streams: []grpc.StreamDesc{
		{
			StreamName:    "Build",
			Handler:       _ImageBuilder_Build_Handler,
			ServerStreams: true,
		},
		{
			StreamName:    "Logs",
			Handler:       _ImageBuilder_Logs_Handler,
			ServerStreams: true,
		},
	},
	Metadata: "imgbuilder.proto",
}
